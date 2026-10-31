// Ticktap lock-screen alerts.
// When the app writes a new alert to rooms/{room}/alerts/{id}, send it as a web push
// to every phone that turned on lock-screen alerts for that account (rooms/{room}/push/{to}/{device}).
const { onValueCreated } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const encK = k => String(k).replace(/[.#$\[\]\/%]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const kindOf = t => /^New request|New spa request/i.test(t) ? 'request' : /^Message from/i.test(t) ? 'msg' : 'note';

exports.ticktapPush = onValueCreated(
  { ref: '/rooms/{room}/alerts/{aid}', instance: 'balik-service-default-rtdb', region: 'asia-southeast1' },
  async event => {
    let a = event.data.val();
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { return; } }
    if (!a || !a.to || !a.title) return;
    if (a.at && Date.now() - a.at > 10 * 60 * 1000) return;          // old alerts copied in when a room is created
    const room = event.params.room;
    const tokRef = admin.database().ref(`rooms/${room}/push/${encK(a.to)}`);
    const devices = (await tokRef.get()).val() || {};
    const list = Object.entries(devices).filter(([, v]) => v && v.token);
    if (!list.length) return;
    const kind = kindOf(a.title);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: list.map(([, v]) => v.token),
      data: { title: String(a.title).slice(0, 120), body: String(a.body || '').slice(0, 300), kind, tag: String(a.bid || event.params.aid), url: './?room=' + room },
      webpush: { headers: { Urgency: 'high', TTL: '900' } }
    });
    // drop tokens the push service says are no longer valid
    const gone = [];
    res.responses.forEach((r, i) => { const c = r.error && r.error.code; if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') gone.push(list[i][0]); });
    await Promise.all(gone.map(d => tokRef.child(d).remove()));
    logger.info('push', { room, to: a.to, sent: res.successCount, failed: res.failureCount, removed: gone.length });
  }
);

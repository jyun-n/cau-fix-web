// 웹 푸시 발송 진단 스크립트 (운영 서버에서 수동 실행용)
//
// 사용법 (리포 루트의 .env를 읽음):
//   node backend/scripts/push-diag.js <member_id>   특정 회원에게만 테스트 푸시
//   node backend/scripts/push-diag.js --all         구독한 전체 회원에게 테스트 푸시 (주의!)
//
// 각 구독별 발송 결과(HTTP 상태코드 / 실패 사유)를 출력한다.
// 404·410은 만료된 구독, 403은 VAPID 키 불일치인 경우가 많다.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const webpush = require('web-push');
const { Pool } = require('pg');

const arg = process.argv[2];
if (!arg || (arg !== '--all' && !Number.isInteger(Number(arg)))) {
  console.error('사용법: node backend/scripts/push-diag.js <member_id> | --all');
  process.exit(1);
}
const target = arg === '--all' ? null : Number(arg);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@caufix.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const q = target
    ? await pool.query('SELECT member_id, endpoint, p256dh, auth FROM push_subscription WHERE member_id=$1', [target])
    : await pool.query('SELECT member_id, endpoint, p256dh, auth FROM push_subscription');
  console.log('구독 수:', q.rows.length);
  for (const row of q.rows) {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      const r = await webpush.sendNotification(
        sub,
        JSON.stringify({ title: '푸시 테스트', body: '테스트 알림입니다', data: {} })
      );
      console.log('OK member', row.member_id, '->', r.statusCode);
    } catch (e) {
      console.log('FAIL member', row.member_id, '->', e.statusCode || 'ERR', (e.body || e.message || '').toString().slice(0, 120));
    }
  }
  await pool.end();
})();

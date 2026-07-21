/**
 * 매일 1회(GitHub Actions) 실행되어:
 * 1) Firestore의 지원사업(programs) 중 접수마감이 D-7 / D-3 / D-1 / D-0 인 건을 찾고
 * 2) 그 사업을 즐겨찾기한 구독자(pushSubscriptions)에게만 푸시 알림을 보낸다.
 * 3) 이미 보낸 마일스톤은 프로그램 문서에 표시해두어 중복 발송을 막는다.
 * 4) 더 이상 유효하지 않은 알림 토큰은 자동으로 정리한다.
 */
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MILESTONES = [7, 3, 1, 0]; // 접수마감 D-7, D-3, D-1, D-0(당일)에 발송

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((target - todayUTC) / 86400000);
}

async function main() {
  const [programsSnap, subsSnap] = await Promise.all([
    db.collection("programs").get(),
    db.collection("pushSubscriptions").get(),
  ]);

  const subscriptions = subsSnap.docs.map((d) => ({
    token: d.id,
    favoritePrograms: d.data().favoritePrograms || [],
  }));

  let sentCount = 0;

  for (const progDoc of programsSnap.docs) {
    const p = progDoc.data();
    const id = progDoc.id;

    if (p.status === "선정완료") continue;
    const d = daysUntil(p.applyEnd);
    if (d === null || !MILESTONES.includes(d)) continue;

    const notifiedField = `notifiedD${d}`;
    if (p[notifiedField]) continue; // 이미 이 마일스톤에 대해 발송 완료

    const targets = subscriptions.filter((s) => s.favoritePrograms.includes(id));

    if (targets.length === 0) {
      await progDoc.ref.update({ [notifiedField]: true });
      continue;
    }

    const title = `${p.name} 접수마감 ${d === 0 ? "D-DAY" : "D-" + d}`;
    const body = d === 0 ? "오늘이 접수마감일입니다." : `접수마감까지 ${d}일 남았습니다.`;
    const tokens = targets.map((t) => t.token);

    try {
      const resp = await admin.messaging().sendEachForMulticast({
        notification: { title, body },
        tokens,
      });

      resp.responses.forEach((r, idx) => {
        if (
          !r.success &&
          (r.error?.code === "messaging/invalid-registration-token" ||
            r.error?.code === "messaging/registration-token-not-registered")
        ) {
          db.collection("pushSubscriptions").doc(tokens[idx]).delete().catch(() => {});
        }
      });

      sentCount += resp.successCount;
      console.log(`[발송] ${p.name} (D-${d}) -> 성공 ${resp.successCount}건 / 실패 ${resp.failureCount}건`);
    } catch (err) {
      console.error(`[오류] ${p.name} 발송 실패:`, err.message);
    }

    await progDoc.ref.update({ [notifiedField]: true });
  }

  console.log(`총 ${sentCount}건의 알림을 발송했습니다.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("스크립트 실행 실패:", err);
    process.exit(1);
  });

import { loadConfig } from "@lp/contracts";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = loadConfig(process.env);
  return (
    <main>
      <h1>বিনিময়</h1>
      <p>এটি একটি পরীক্ষামূলক শেল। এখন শুধু লগইন ও অ্যাকাউন্ট চালু আছে।</p>
      <p>
        <a href="/login">লগইন</a> · <a href="/account">অ্যাকাউন্ট</a>
      </p>
      <dl>
        <dt>পরিবেশ</dt>
        <dd>{config.APP_ENV}</dd>
        <dt>পেমেন্ট</dt>
        <dd>{config.PAYMENT_MODE} (নকল, কোনো আসল টাকা নয়)</dd>
        <dt>যাচাইকারী</dt>
        <dd>{config.VERIFIER_MODE}</dd>
        <dt>গবেষণা</dt>
        <dd>{config.RESEARCH_MODE}</dd>
        <dt>এআই</dt>
        <dd>{config.AI_MODE}</dd>
      </dl>
    </main>
  );
}

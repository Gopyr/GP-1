import { runPentest } from './pentest.mjs'; // reuse LLM utilities if needed
import { parseRamp } from './ramp.mjs';

const DEFAULT_LLM = process.env.STRIX_LLM || 'hermes';
const DEFAULT_API_BASE = process.env.LLM_API_BASE || 'http://127.0.0.1:20128/v1';

/**
 * Ask the LLM to analyze the target URL and recommend a load testing ramp stage spec.
 * @param {string} targetUrl
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function getAiRampRecommendation(targetUrl, apiKey) {
  const model = DEFAULT_LLM;
  const base = DEFAULT_API_BASE;

  console.log(`\n[GP-1 AI] Menganalisis target: ${targetUrl} via AI (${model})...`);

  const prompt = `Anda adalah seorang ahli infrastruktur sistem berskala global.
Kami ingin melakukan load testing pada URL target berikut: "${targetUrl}".
Silakan buatkan rekomendasi strategi ramping beban dalam format JSON yang bersih berisi satu field saja "rampSpec" yang nilainya berupa GP-1 ramp spec string (contoh format: "concurrency:durasi,concurrency:durasi", seperti "5:10s,20:20s,5:10s").
Pastikan rekomendasi ini aman, bertahap, dan tidak merusak sistem. Jangan berikan teks penjelasan lain, hanya JSON murni.`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) {
      throw new Error(`9router HTTP error ${res.status}`);
    }

    const data = await res.json();
    const content = JSON.parse(data.choices[0].message.content);
    return content.rampSpec || '5:10s,15:15s,5:10s'; // fallback
  } catch (e) {
    console.warn(`[GP-1 AI] Gagal mendapatkan rekomendasi AI: ${e.message}. Menggunakan default ramp.`);
    return '5:5s,20:10s,5:5s';
  }
}

/**
 * Ask the LLM to analyze the load testing report results and provide optimization recommendations.
 * @param {object} report
 * @param {string} apiKey
 */
export async function printAiReportAnalysis(report, apiKey) {
  const model = DEFAULT_LLM;
  const base = DEFAULT_API_BASE;

  console.log(`\n[GP-1 AI] Menganalisis metrik hasil pengujian via AI...`);

  const prompt = `Anda adalah ahli DevOps dan Database Administrator senior kualifikasi internasional.
Berikut adalah laporan hasil pengujian load testing GP-1 terhadap target "${report.config.url}":

${JSON.stringify(report, null, 2)}

Analisis data tersebut dan berikan laporan ringkas (on-point, tanpa basa-basi, bahasa Indonesia santai tapi profesional, maksimal 20 baris) tentang:
1. Diagnosis apakah server kuat atau mengalami bottleneck (latensi melonjak, error rate tinggi, dsb.).
2. Rekomendasi teknis nyata dan spesifik (indeks DB, koneksi pool, optimasi resource, caching).
3. Evaluasi performa secara keseluruhan.`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      throw new Error(`9router HTTP error ${res.status}`);
    }

    const data = await res.json();
    const analysis = data.choices[0].message.content;
    console.log(`\n======================================================`);
    console.log(`🧠 GP-1 AI PERFORMANCE DIAGNOSIS & OPTIMIZATION`);
    console.log(`======================================================`);
    console.log(analysis);
    console.log(`======================================================\n`);
  } catch (e) {
    console.error(`[GP-1 AI] Gagal melakukan analisis hasil uji: ${e.message}`);
  }
}

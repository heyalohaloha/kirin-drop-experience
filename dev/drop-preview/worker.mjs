import { analyzeWav } from "./analyze.mjs";
self.onmessage = async ({ data }) => {
  try { self.postMessage({ result: await analyzeWav(data, (progress) => self.postMessage({ progress })) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};

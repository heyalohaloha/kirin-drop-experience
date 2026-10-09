import { analyzePublicWav } from './analyze.mjs';
self.onmessage = async ({data}) => {
  try {self.postMessage({result: await analyzePublicWav(data, progress => self.postMessage({progress}))});}
  catch (error) {self.postMessage({error: ['public-size','public-rate','public-duration'].includes(error.message) ? error.message : 'invalid-wav'});}
};

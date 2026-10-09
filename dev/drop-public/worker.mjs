import { analyzePublicWav } from './analyze.mjs';
import {validatePublicFile} from './policy.mjs';
self.onmessage = async ({data}) => {
  try {
    if(data instanceof Blob) {await validatePublicFile(data); data=await data.arrayBuffer();}
    self.postMessage({result: await analyzePublicWav(data, progress => self.postMessage({progress}))});
  }
  catch (error) {self.postMessage({error: ['public-rate','public-duration'].includes(error.message) ? error.message : 'invalid-wav'});}
};

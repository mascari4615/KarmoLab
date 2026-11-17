import { weatherField } from './weather-field.mjs';
self.onmessage=({data:seed})=>{const result=weatherField(seed);self.postMessage(result,[result.data.buffer]);};

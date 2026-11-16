import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.2.17';
import {workflowIdentity} from './workerTrust.ts';
const keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export async function verifyWorker(token:string){try{const {payload}=await jwtVerify(token,keys,{issuer:'https://token.actions.githubusercontent.com',audience:'ximi-transcription',algorithms:['RS256'],requiredClaims:['exp','nbf','iat']});return workflowIdentity(payload);}catch{return null;}}

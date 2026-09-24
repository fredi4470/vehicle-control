import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseVehicleRepository } from '../dist/repository.js';
const storage = new Map();
globalThis.sessionStorage = { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('Login, pagination, mapping, versioned writes, denied member and expiry',async()=>{
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});
    if(url.includes('/auth/v1/token')) return respond({access_token:'test-access',expires_in:3600});
    assert.equal(opts.headers.Authorization,'Bearer test-access');
    if(url.includes('vc_require_member'))return respond(true);
    if(url.includes('vc_vehicles'))return respond(url.includes('offset=0')?[{id:'demo-1',vin:'TEST0000000000001',brand:'Hyundai',model:'Tucson',condition:'Neuwagen',qr_id:'VC-DEMO-0001',area_id:1,version:2,updated_at:null}]:[]);
    if(url.includes('vc_move_vehicle'))return respond({message:'Standort inzwischen geändert.'},409);
    return respond([]);
  };
  const repo=new SupabaseVehicleRepository();
  await assert.rejects(()=>repo.list(),/anmelden/);
  await repo.signIn('test@example.com','not-a-real-password');
  assert.ok(repo.isSignedIn());
  assert.ok(new SupabaseVehicleRepository().isSignedIn());
  const rows=await repo.list();
  assert.equal(rows[0].qrId,'VC-DEMO-0001');
  assert.equal(rows[0].areaId,1);
  assert.ok(calls.some(c=>c.url.includes('offset=1')));
  await assert.rejects(()=>repo.move('demo-1',16,2),/Parkareal/);
  await assert.rejects(()=>repo.move('demo-1',5,2),/inzwischen/);
  assert.deepEqual(JSON.parse(calls.at(-1).opts.body),{p_id:'demo-1',p_area:5,p_version:2});
  repo.session.expires_at=1;
  await assert.rejects(()=>repo.list(),/abgelaufen/);
  assert.equal(repo.session,null);
  globalThis.fetch=async url=>url.includes('/auth/v1/token')?respond({access_token:'test-access',expires_in:3600}):respond({message:'Nicht freigeschaltet'},403);
  await assert.rejects(()=>repo.signIn('test@example.com','x'),/freigeschaltet/);
  assert.equal(repo.session,null);
});

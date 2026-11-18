import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,paint} from '../src/terrain.mjs';
import {sampleDetail} from '../src/detail.mjs';
import {editSnapshot,restoreEdit} from '../src/editor.mjs';

test('작은 붓과 큰 붓을 섞은 실행 취소와 다시 실행이 같은 높이를 복원',()=>{
 let world=createWorld({blank:true});const before=sampleDetail(world,.2,.5).height,first=editSnapshot(world,true);
 paint(world,.2,.5,'raise',.0001,.2);const fineHeight=sampleDetail(world,.2,.5).height,second=editSnapshot(world);
 paint(world,.2,.5,'raise',.04,.1);const end=sampleDetail(world,.2,.5).height,redoCoarse=editSnapshot(world);
 world=restoreEdit(world,second);assert.equal(sampleDetail(world,.2,.5).height,fineHeight);
 const redoFine=editSnapshot(world,true);world=restoreEdit(world,first);assert.equal(sampleDetail(world,.2,.5).height,before);
 assert.equal(world.detailBaseHeights,undefined);
 world=restoreEdit(world,redoFine);assert.equal(sampleDetail(world,.2,.5).height,fineHeight);
 world=restoreEdit(world,redoCoarse);assert.equal(sampleDetail(world,.2,.5).height,end);
 assert.equal(first.heights,undefined);assert.equal(first.biomes,undefined);
});

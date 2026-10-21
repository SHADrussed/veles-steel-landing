import test from 'node:test';
import assert from 'node:assert/strict';
import {reserve} from '../tools/qa-attempt.mjs';
test('persistent issue counter refuses fourth cycle without mutation',()=>{const ledger={issues:[{id:'overflow',state:'confirmed',attempts:0}]};for(let n=1;n<=3;n++)assert.equal(reserve(ledger,'overflow').attempts,n);assert.throws(()=>reserve(ledger,'overflow'),/three/);assert.equal(ledger.issues[0].attempts,3);});
test('ambiguous, unknown and resolved issues stop before correction',()=>{for(const state of ['needs-design','resolved'])assert.throws(()=>reserve({issues:[{id:'x',state,attempts:0}]},'x'),/STOP/);assert.throws(()=>reserve({issues:[]},'missing'),/evidence/);});

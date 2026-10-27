import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quote} from '../site/dist/price-policy.js';
// Synthetic test-only tariff. Never a commercial price for Veles Steel.
const p={category:'fixture',product:'sample',type:'test',gost:'test',tonnes:'2'};
const tariff={...p,unit:'т',amount:7,approved:true,source:'synthetic fixture'};
test('no price without an approved exact tariff',()=>{
 assert.equal(quote(p),null);
 for(const override of [{approved:false},{source:''},{type:'other'},{gost:'other'},{unit:'шт.'},{amount:Infinity},{amount:-1}])assert.equal(quote(p,[{...tariff,...override}]),null);
});
test('explicit same-unit quantity only; ambiguous entries never choose precedence',()=>{
 assert.deepEqual(quote(p,[tariff]),{total:14,unit:'т',unitPrice:7});
 assert.equal(quote({...p,area:'3'},[tariff]),null);
 assert.equal(quote({...p,tonnes:'0'},[tariff]),null);
 assert.equal(quote(p,[tariff,tariff]),null);
 assert.equal(quote({...p,tonnes:'',width:'2',length:'3'},[tariff]),null);
});

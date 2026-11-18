import {FinRate} from './engine/service.mjs';
import {createStore} from './engine/store.mjs';
import {authorizeVault, createVault} from './engine/crypto.mjs';
import {createAccess} from './engine/device-access.mjs';
import {addCategory, fail, money, newDocument, totals, uid} from './engine/model.mjs';
import {cancelOperation, saveOperation} from './engine/operations.mjs';

const store = createStore('finrate-full-test-restart-v1');
const engine = new FinRate(store);

export async function boot() {
  if (!await store.read()) {
    const password = uid() + uid();
    const {vault} = await createVault(newDocument(),password);
    const auth = await authorizeVault(vault,password);
    try {
      const access = await createAccess(vault,auth.raw,'none');
      try { await store.commit(vault,undefined,{access}); }
      catch (error) { if (error.code !== 'STALE') throw error; }
    } finally { auth.raw.fill(0); }
  }
  await engine.unlockLocal();
}

export const document = () => engine.document;
export const mutate = (action, fn) => engine.mutate(action,fn);
export const fact = range => totals(document(),range);
export const addOperationCategory = entry => engine.mutate('category.add',doc=>addCategory(doc,entry));
export const cancel = id => engine.mutate('operation.cancel',doc=>cancelOperation(doc,id));

export function save(draft, previous) {
  return engine.mutate(previous?'operation.edit':'operation.add',doc=>{
    const category = doc.categories.find(item=>item.id===draft.categoryId);
    const account = doc.accounts.find(item=>item.id===draft.accountId);
    if (!category || category.type!==draft.kind || category.archived || !account || account.archived) fail('SELECTION');
    const amount = money(draft.amount);
    if (amount<=0 || amount>99999999999 || draft.note.length>500) fail('AMOUNT');
    return saveOperation(doc,{
      id:draft.id, kind:draft.kind, accountId:draft.accountId, date:draft.date,
      amount, note:draft.note, ...(draft.creditDueDate ? {creditDueDate:draft.creditDueDate} : {}), allocations:[{categoryId:draft.categoryId,amount}]
    },previous?{editId:previous.id,editBase:JSON.stringify(previous)}:undefined);
  });
}

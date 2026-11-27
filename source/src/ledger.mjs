import {clearedFirstUse} from './engine/reset-policy.mjs';
import {FinRate} from './engine/service.mjs';
import {createStore} from './engine/store.mjs';
import {authorizeVault, createVault, seal} from './engine/crypto.mjs';
import {createAccess} from './engine/device-access.mjs';
import {addCategory, fail, money, newDocument, totals, uid} from './engine/model.mjs';
import {cancelOperation, saveOperation} from './engine/operations.mjs';

const store = createStore('finrate-full-test-restart-v1');
const engine = new FinRate(store);

function emptyDocument(currency) {
  const document = newDocument(currency);
  for (const name of ['Продукты','Кафе и рестораны','Жильё','Транспорт','Связь','Здоровье','Дети','Покупки']) addCategory(document,{name});
  for (const name of ['Зарплата','Дополнительный доход','Прочие поступления']) addCategory(document,{name,type:'income'});
  return document;
}

export async function resetAll(expected) {
  return engine.exclusive(async()=>{
    if(engine.document!==expected)fail('STALE');
    const replacement=await initialVault(expected.currency);
    await store.reset(engine.record,{replacement});
    try {localStorage.removeItem('finrate-first-use-intros');localStorage.removeItem('finrate-fu-data-used');} catch {}
    location.reload();
  });
}

export async function clearFinancial(expected,options){
  return engine.exclusive(async()=>{
    if(engine.document!==expected)fail('STALE');
    const next=clearedFirstUse(expected,options);
    const vault=await seal(next,engine.key,engine.record.vault.slots);
    await store.clearFinancial(vault,engine.record);
    try {localStorage.setItem('finrate-fu-data-used','1');} catch {}
    location.reload();
  });
}

async function initialVault(currency) {
  const password = uid() + uid();
  const {vault} = await createVault(emptyDocument(currency),password);
  const auth = await authorizeVault(vault,password);
  try {
    const access = await createAccess(vault,auth.raw,'none');
    return {vault,access};
  } finally { auth.raw.fill(0); }
}

export async function boot() {
  if (!await store.read()) {
    const {vault,access} = await initialVault();
    try { await store.commit(vault,undefined,{access}); }
    catch (error) { if (error.code !== 'STALE') throw error; }
  }
  await engine.unlockLocal();
}

export const document = () => engine.document;
export const exportBackup = password => engine.exportLocalBackup(password);
export const restoreBackup = (file,password) => engine.restoreLocalBackup(file,password);
export const resetPreview = mode => engine.resetPreview(mode);
export const prepareReset = (intent,file,password) => engine.prepareLocalReset(intent,file,password);
export const applyReset = (proof,phrase) => engine.resetData(proof,phrase);
export const discardReset = () => engine.discardReset();
export const mutate = (action, fn) => engine.mutate(action,fn);
export const fact = range => totals(document(),range);
export const addOperationCategory = entry => engine.mutate('category.add',doc=>addCategory(doc,entry));
export const cancel = id => engine.mutate('operation.cancel',doc=>cancelOperation(doc,id));

export function save(draft, previous) {
  return engine.mutate(previous?'operation.edit':'operation.add',doc=>{
    const category = doc.categories.find(item=>item.id===draft.categoryId);
    const account = doc.accounts.find(item=>item.id===draft.accountId);
    if (!category || category.type!==draft.kind || category.archived || (draft.accountId!==null&&!account) || account?.archived) fail('SELECTION');
    const amount = money(draft.amount);
    if (amount<=0 || amount>99999999999 || draft.note.length>500) fail('AMOUNT');
    if(previous&&doc.operations.some(o=>o.kind==='refund'&&o.referenceId===previous.id&&!o.cancelled)&&previous.accountId!==draft.accountId)fail('REFUND_LINKED');
    const credit=account?.financeType==='credit';
    const creditFunding=credit&&draft.kind==='expense'&&(previous?.creditFunding==='purchase'||previous?.accountId!==account.id)?'purchase':undefined;
    const allocations=previous?.amount===amount&&previous.allocations[0]?.categoryId===draft.categoryId?
      previous.allocations:[{categoryId:draft.categoryId,amount}];
    return saveOperation(doc,{
      id:draft.id, kind:draft.kind, accountId:draft.accountId, date:draft.date,
      amount, note:draft.note, creditFunding, creditDueDate:credit?draft.creditDueDate||undefined:'', allocations
    },previous?{editId:previous.id,editBase:JSON.stringify(previous)}:undefined);
  });
}

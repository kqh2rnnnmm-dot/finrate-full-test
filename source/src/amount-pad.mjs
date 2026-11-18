export const validAmount = value => /^\d{1,9}(,\d{0,2})?$/.test(value)&&Number(value.replace(',','.'))>0;
export const normalizedAmount = value => value.endsWith(',') ? value.slice(0,-1) : value;

export function editAmount(value,key) {
  if(key==='backspace')return value.slice(0,-1);
  if(key===',')return value.includes(',') ? value : (value||'0')+',';
  if(!/^\d$/.test(key))return value;
  const next=value==='0'?key:value+key;
  return /^\d{1,9}(,\d{0,2})?$/.test(next) ? next : value;
}

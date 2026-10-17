import { getLanguage, message as t } from '../i18n.js';
import {parseNumberFor} from '../lib/admin-locale.js';
import {showToast} from './toast.js';
const blocked=new WeakSet();
function numberInput(target) { return target instanceof HTMLInputElement && target.type==='number' && !target.disabled && !target.readOnly; }
function insertNumberText(input,text) {
  // setRangeText/selectionStart are not supported for native number controls. insertText keeps
  // the native caret, selection and undo buffer; never replace the whole field as a fallback.
  try { if(document.execCommand('insertText',false,text))return true; } catch { /* unsupported browser */ }
  blocked.add(input);showToast(t('locale.number_separator_hint'),'error');return false;
}
export function installLocalizedNumberInput() {
  document.addEventListener('keydown',event=>{
    const input=event.target;if(!numberInput(input)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(blocked.has(input)) {
      if(['.','Backspace','Delete','Escape'].includes(event.key))blocked.delete(input);
      else if(/^\d$/.test(event.key)){event.preventDefault();return;}
    }
    // Some English browser builds silently drop a comma even with html lang=tr: "1,5" becomes
    // 15. Normalize the decimal separator at the editing boundary, preserving canonical .value.
    if(getLanguage()==='tr'&&event.key===','){event.preventDefault();insertNumberText(input,'.');}
  });
  document.addEventListener('paste',event=>{
    const input=event.target;if(!numberInput(input))return;
    const text=event.clipboardData?.getData('text/plain');
    if(!text||!text.includes(','))return;
    const value=parseNumberFor(text,getLanguage());if(!Number.isFinite(value))return;
    event.preventDefault();insertNumberText(input,String(value));
  });
}

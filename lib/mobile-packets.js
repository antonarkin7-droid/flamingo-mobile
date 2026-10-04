import {month} from './model.js';
const months=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
export function packetFolder(period,category,kind){
 if(!month(period)||!['receipt','other'].includes(kind)||typeof category!=='string'||!category.trim()||category.length>100||/[\\/:\u0000-\u001f]/.test(category)||category.includes('..'))throw new Error('Проверьте месяц, статью и тип документа');
 return `${period.slice(0,4)}/Расходы ${category.trim()} ${months[Number(period.slice(5))-1]} ${kind==='receipt'?'с чеком':'без чека'}`;
}
export function validateMobileManifest(value,path){
 if(value?.version!==1||!/^[-a-zA-Z0-9]{1,80}$/.test(value.id)||!Array.isArray(value.files)||!value.files.length||value.files.length>30)throw new Error('Некорректные данные мобильного документа');
 if(value.files.some(f=>typeof f!=='string'||/[\\/]/.test(f)||!/^[-a-zA-Z0-9]+\.(jpg|jpeg|png|pdf)$/i.test(f)))throw new Error('Некорректные файлы мобильного документа');
 if(value.processed!==undefined&&(!Array.isArray(value.processed)||value.processed.length!==value.files.length||value.processed.some(f=>f!==null&&(typeof f!=='string'||!/^[-a-zA-Z0-9]+-processed\.png$/.test(f)))))throw new Error('Некорректные обработанные фото');
 const expected=packetFolder(value.period,value.category,value.kind);
 if(path!==expected)throw new Error('Папка не соответствует месяцу и статье документа');
 return value;
}

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/locales');

function getAllKeys(obj, prefix = '') {
    let keys = [];
    for (const key in obj) {
        const fullKey = prefix ? prefix + '.' + key : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            keys = keys.concat(getAllKeys(obj[key], fullKey));
        } else {
            keys.push(fullKey);
        }
    }
    return keys;
}

const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));
const allData = {};

files.forEach(file => {
    const lang = file.replace('.json', '');
    const content = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    allData[lang] = new Set(getAllKeys(content));
});

const ptKeys = allData['pt'];
const enKeys = allData['en'];

console.log('=== AUDITORIA DE CHAVES i18n ===\n');
console.log(`Total de chaves em PT: ${ptKeys.size}`);
console.log(`Total de chaves em EN: ${enKeys.size}\n`);

// Verificar chaves em PT que não existem em EN
const ptOnlyKeys = [...ptKeys].filter(k => !enKeys.has(k));
console.log('Chaves em PT que NÃO existem em EN:');
console.log(ptOnlyKeys.length > 0 ? ptOnlyKeys.join('\n') : '  Nenhuma\n');

// Verificar chaves em EN que não existem em PT
const enOnlyKeys = [...enKeys].filter(k => !ptKeys.has(k));
console.log('\nChaves em EN que NÃO existem em PT:');
console.log(enOnlyKeys.length > 0 ? enOnlyKeys.join('\n') : '  Nenhuma\n');

// Verificar cada idioma
const otherLangs = Object.keys(allData).filter(l => l !== 'pt' && l !== 'en');

console.log('\n=== CHAVES FALTANDO POR IDIOMA ===\n');

otherLangs.forEach(lang => {
    const langKeys = allData[lang];
    const missing = [...ptKeys].filter(k => !langKeys.has(k));

    console.log(`[${lang.toUpperCase()}] ${missing.length} chaves faltando:`);
    if (missing.length > 0) {
        missing.forEach(k => console.log(`  - ${k}`));
    } else {
        console.log('  ✓ Completo');
    }
    console.log('');
});

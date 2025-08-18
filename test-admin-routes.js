#!/usr/bin/env node

const http = require('http');
const path = require('path');
const fs = require('fs');

console.log('🧪 TEST ROUTES ADMIN - Validation des corrections');
console.log('='.repeat(50));

// Test 1: Vérifier les fichiers localement
console.log('\n📁 VÉRIFICATION FICHIERS LOCAUX:');
const adminFilePath = path.join(__dirname, 'pages', 'admin', 'admin.html');
console.log(`📍 Chemin: ${adminFilePath}`);
console.log(`✅ Existe: ${fs.existsSync(adminFilePath)}`);
if (fs.existsSync(adminFilePath)) {
    const stats = fs.statSync(adminFilePath);
    console.log(`📏 Taille: ${stats.size} bytes`);
    console.log(`📅 Modifié: ${stats.mtime}`);
}

// Test 2: Vérifier le contenu du fichier
if (fs.existsSync(adminFilePath)) {
    const content = fs.readFileSync(adminFilePath, 'utf8');
    const hasHtml = content.includes('<html');
    const hasBody = content.includes('<body');
    const hasScript = content.includes('<script');
    console.log(`🏷️ Contient <html>: ${hasHtml}`);
    console.log(`🏷️ Contient <body>: ${hasBody}`);
    console.log(`🏷️ Contient <script>: ${hasScript}`);
    console.log(`📏 Taille réelle: ${content.length} caractères`);
}

async function testRemoteUrl(url, description) {
    return new Promise((resolve) => {
        console.log(`\n🌐 TEST: ${description}`);
        console.log(`📍 URL: ${url}`);
        
        const req = http.request(url, { method: 'GET' }, (res) => {
            console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`📏 Taille réponse: ${data.length} bytes`);
                console.log(`🏷️ Content-Type: ${res.headers['content-type'] || 'N/A'}`);
                console.log(`🏷️ Server: ${res.headers['server'] || 'N/A'}`);
                
                if (data.length === 0) {
                    console.log('❌ PROBLÈME: Contenu vide (page blanche)');
                } else if (data.length < 100) {
                    console.log(`📄 Contenu court: "${data.substring(0, 80)}"`);
                } else {
                    console.log(`✅ Contenu présent (${data.length} chars)`);
                    // Vérifier si c'est du HTML valide
                    if (data.includes('<html') || data.includes('<!DOCTYPE')) {
                        console.log('✅ HTML valide détecté');
                    } else {
                        console.log('⚠️ Pas de HTML valide détecté');
                    }
                }
                
                resolve({ status: res.statusCode, length: data.length, data });
            });
        });
        
        req.on('error', (error) => {
            console.log(`❌ Erreur: ${error.message}`);
            resolve({ error: error.message });
        });
        
        req.setTimeout(5000, () => {
            console.log(`⏰ Timeout`);
            req.destroy();
            resolve({ error: 'timeout' });
        });
        
        req.end();
    });
}

async function runTests() {
    console.log('\n' + '='.repeat(50));
    console.log('🌐 TESTS SERVEUR DISTANT:');
    
    // Test des différentes variantes
    await testRemoteUrl('http://photo.mprnl.fr/admin', 'Admin sans slash');
    await testRemoteUrl('http://photo.mprnl.fr/admin/', 'Admin avec slash');
    
    console.log('\n' + '='.repeat(50));
    console.log('💡 PROCHAINES ÉTAPES:');
    console.log('1. Si page toujours vide → Redéployer le code');
    console.log('2. Si erreur 404 → Vérifier chemins des fichiers');
    console.log('3. Si erreur 500 → Consulter logs serveur');
    console.log('4. Comparer taille locale vs distante');
}

runTests().catch(console.error);

#!/usr/bin/env node

console.log('🔍 DIAGNOSTIC SERVEUR DISTANT - photo.mprnl.fr');
console.log('='.repeat(60));

const https = require('https');
const http = require('http');

async function checkUrl(url, description) {
    return new Promise((resolve) => {
        console.log(`\n📡 Test: ${description}`);
        console.log(`🌐 URL: ${url}`);
        
        const client = url.startsWith('https') ? https : http;
        
        const req = client.request(url, { method: 'GET' }, (res) => {
            console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);
            console.log(`🏷️ Headers:`);
            Object.entries(res.headers).forEach(([key, value]) => {
                console.log(`   ${key}: ${value}`);
            });
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`📏 Content Length: ${data.length} bytes`);
                if (data.length > 0 && data.length < 500) {
                    console.log(`📄 Content preview:\n${data.substring(0, 200)}...`);
                } else if (data.length === 0) {
                    console.log(`⚠️ CONTENU VIDE - Page blanche détectée!`);
                }
                resolve({ status: res.statusCode, length: data.length, headers: res.headers });
            });
        });
        
        req.on('error', (error) => {
            console.log(`❌ Erreur: ${error.message}`);
            resolve({ error: error.message });
        });
        
        req.setTimeout(10000, () => {
            console.log(`⏰ Timeout après 10 secondes`);
            req.destroy();
            resolve({ error: 'timeout' });
        });
        
        req.end();
    });
}

async function runDiagnostic() {
    const tests = [
        ['http://photo.mprnl.fr', 'Page d\'accueil'],
        ['http://photo.mprnl.fr/admin', 'Page admin (problématique)'],
        ['http://photo.mprnl.fr/admin/status', 'API Status admin'],
        ['http://photo.mprnl.fr/photos-list', 'API Liste photos'],
        ['https://photo.mprnl.fr', 'HTTPS - Page d\'accueil'],
        ['https://photo.mprnl.fr/admin', 'HTTPS - Page admin']
    ];
    
    for (const [url, description] of tests) {
        await checkUrl(url, description);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Pause entre les tests
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 ANALYSE:');
    console.log('- Si toutes les réponses montrent Apache au lieu de Node.js → Problème de configuration serveur');
    console.log('- Si Content-Length: 0 → Fichiers manquants ou permissions');
    console.log('- Si erreurs 404/500 → Routes non configurées');
    console.log('- Comparer avec le serveur local (Node.js) vs distant (Apache)');
    
    console.log('\n🔧 SOLUTIONS POSSIBLES:');
    console.log('1. Vérifier si Node.js est bien démarré sur le serveur');
    console.log('2. Vérifier la configuration Apache/Nginx proxy');
    console.log('3. Vérifier que les fichiers sont bien uploadés');
    console.log('4. Vérifier les permissions des fichiers');
    console.log('5. Consulter les logs du serveur distant');
}

runDiagnostic().catch(console.error);

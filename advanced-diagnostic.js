#!/usr/bin/env node

const http = require('http');

async function testWithHeaders(url, description, extraHeaders = {}) {
    return new Promise((resolve) => {
        console.log(`\n🧪 TEST: ${description}`);
        console.log(`📍 URL: ${url}`);
        
        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Diagnostic-Tool/1.0',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                ...extraHeaders
            }
        };
        
        const req = http.request(url, options, (res) => {
            console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);
            
            // Afficher les headers importants
            const importantHeaders = ['content-length', 'content-type', 'server', 'x-powered-by', 'etag', 'last-modified'];
            importantHeaders.forEach(header => {
                if (res.headers[header]) {
                    console.log(`🏷️ ${header}: ${res.headers[header]}`);
                }
            });
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`📏 Taille réponse: ${data.length} bytes`);
                
                if (data.length === 0) {
                    console.log('❌ PROBLÈME: Réponse vide');
                } else if (data.length < 200) {
                    console.log(`📄 Contenu complet: "${data}"`);
                } else {
                    const preview = data.substring(0, 100);
                    console.log(`📄 Aperçu: "${preview}..."`);
                    
                    // Analyser le contenu HTML
                    if (data.includes('<!DOCTYPE html>')) {
                        console.log('✅ DOCTYPE HTML détecté');
                    }
                    if (data.includes('Administration')) {
                        console.log('✅ Titre Administration détecté');
                    }
                    if (data.includes('login-form')) {
                        console.log('✅ Formulaire de connexion détecté');
                    }
                }
                
                resolve({ status: res.statusCode, length: data.length, headers: res.headers });
            });
        });
        
        req.on('error', (error) => {
            console.log(`❌ Erreur: ${error.message}`);
            resolve({ error: error.message });
        });
        
        req.setTimeout(10000);
        req.end();
    });
}

async function runDiagnostic() {
    console.log('🔍 DIAGNOSTIC AVANCÉ - Route /admin après déploiement');
    console.log('='.repeat(60));
    
    // Test 1: Sans cache
    await testWithHeaders('http://photo.mprnl.fr/admin/', 
        'Admin avec slash (sans cache)', 
        { 'Cache-Control': 'no-store, must-revalidate' }
    );
    
    // Test 2: Avec timestamp pour éviter le cache
    const timestamp = Date.now();
    await testWithHeaders(`http://photo.mprnl.fr/admin/?t=${timestamp}`, 
        'Admin avec paramètre anti-cache'
    );
    
    // Test 3: Tester une autre route admin qui fonctionne
    await testWithHeaders('http://photo.mprnl.fr/admin/status', 
        'Route API Status (référence)'
    );
    
    // Test 4: Avec User-Agent différent
    await testWithHeaders('http://photo.mprnl.fr/admin/', 
        'Admin avec User-Agent curl', 
        { 'User-Agent': 'curl/7.68.0' }
    );
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 ANALYSE:');
    console.log('✅ API fonctionne → Node.js est bien actif');
    console.log('❌ Route HTML vide → Problème spécifique au serving de fichier');
    console.log('');
    console.log('🔧 SOLUTIONS À ESSAYER:');
    console.log('1. Vérifier les logs du serveur distant');
    console.log('2. Redémarrer le service Node.js sur le serveur');
    console.log('3. Vérifier les permissions du fichier admin.html');
    console.log('4. Tester en mode debug sur le serveur distant');
}

runDiagnostic().catch(console.error);

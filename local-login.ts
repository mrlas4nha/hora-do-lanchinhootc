import axios from 'axios';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function login() {
  const email = await new Promise<string>(resolve => rl.question('Email: ', resolve));
  const password = await new Promise<string>(resolve => rl.question('Password: ', resolve));
  const baseUrl = 'bullex.com';

  console.log('Logging in...');

  try {
    const warmup = await axios.get(`https://${baseUrl}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      }
    });
    const cookies = warmup.headers['set-cookie'] || [];

    const response = await axios.post(`https://${baseUrl}/api/v2/login`, {
      identifier: email,
      password: password,
      platform: 9
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Cookie': cookies.join('; ')
      }
    });

    if (response.data && response.data.ssid) {
      console.log('\n--- SUCCESS ---');
      console.log('SSID:', response.data.ssid);
      console.log('----------------\n');
      console.log('Copie este SSID e cole no campo "SSID Manual" no seu Sniper.');
    } else {
      console.log('Falha: SSID não retornado.');
    }
  } catch (e: any) {
    console.error('Erro:', e.message);
  } finally {
    rl.close();
  }
}

login();

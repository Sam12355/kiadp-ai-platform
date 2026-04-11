const BASE = 'http://localhost:3001/api/v1';

const QUERIES = [
  { 
    name: 'Drying dates',
    q: 'show me the photo of traditional drying and processing of harvest dates in siwa',
    expectPages: [27],     // Fig 10 only
    rejectPages: [26, 29], // NOT Fig 9 (pollination) or Fig 11 (rope)
  },
  {
    name: 'Pigeon towers',
    q: 'show me image of pigeon towers in siwa',
    expectPages: [32],     // Fig 14
    rejectPages: [],
  },
  {
    name: 'Pollination',
    q: 'show me image of pollinating date palm',
    expectPages: [26],     // Fig 9
    rejectPages: [],
  },
  {
    name: 'Date varieties',
    q: 'show me photos of different date varieties',
    expectPages: [18],     // Fig 6 (morphology of fruit)
    rejectPages: [],
  },
  {
    name: 'Spearmint (negative)',
    q: 'what are the main tourist attractions in Siwa',
    expectPages: [],       // No images expected (text-only)
    rejectPages: [38],     // NOT Fig 19 (spearmint) — Table 5 false positive
  },
];

async function main() {
  // Login
  const loginResp = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'client@khalifa.ae', password: 'client123' }),
  });
  const loginData: any = await loginResp.json();
  const token = loginData.data.tokens.accessToken;

  let allPassed = true;

  for (const test of QUERIES) {
    console.log(`\n=== ${test.name} ===`);
    console.log(`Query: "${test.q}"`);
    
    const resp = await fetch(`${BASE}/knowledge/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ question: test.q }),
    });
    const data: any = await resp.json();
    const images = data.data?.images ?? [];
    const pages = images.map((img: any) => img.pageNumber);
    
    console.log(`  Returned pages: [${pages.join(', ')}] (${images.length} images)`);
    for (const img of images) {
      console.log(`    p${img.pageNumber}: ${(img.description ?? '').substring(0, 80)}`);
    }

    // Check expected pages
    let pass = true;
    for (const ep of test.expectPages) {
      if (!pages.includes(ep)) {
        console.log(`  FAIL: Expected page ${ep} not found!`);
        pass = false;
      }
    }
    for (const rp of test.rejectPages) {
      if (pages.includes(rp)) {
        console.log(`  FAIL: Rejected page ${rp} found!`);
        pass = false;
      }
    }
    if (pass) {
      console.log(`  PASS`);
    }
    allPassed = allPassed && pass;
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
  process.exit(allPassed ? 0 : 1);
}

main();

(function dumpAllBeraProjects() {
  if (!window.__next_f || !Array.isArray(window.__next_f)) {
    console.error("Could not find window.__next_f object.");
    return;
  }

  // 1. Combine absolutely all text fragments pushed by Next.js up to this point
  const completePayload = window.__next_f
    .map(chunk => (Array.isArray(chunk) && chunk[1] ? chunk[1] : ''))
    .join('\n');

  console.log("Analyzing full streaming payload...");

  // 2. Look for project definitions across the entire streamed string data
  // Next.js encodes JSON properties into the text streams. We can match Twitter profiles or Project Names.
  const nameMatches = completePayload.match(/"name":"[^"]+"/g) || [];
  const uniqueNames = [...new Set(nameMatches.map(n => n.replace(/"name":"|"/g, '')))];

  console.log(`%cTotal Unique Projects Found in Stream: ${uniqueNames.length}`, "color: #4CAF50; font-weight: bold;");

  // 3. Scan the deep React fiber node structures again for the full unrolled array
  let masterArray = null;
  try {
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
      const reactKey = Object.keys(el).find(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
      if (!reactKey) continue;
      
      let node = el[reactKey];
      while (node) {
        const props = node.memoizedProps;
        if (props && typeof props === 'object') {
          for (let p in props) {
            // Looking for the massive dataset array (bigger than the 7 featured items)
            if (Array.isArray(props[p]) && props[p].length > 7) {
              const sample = JSON.stringify(props[p][0]);
              if (sample && (sample.includes('twitter') || sample.includes('website'))) {
                masterArray = props[p];
                break;
              }
            }
          }
        }
        if (masterArray) break;
        node = node.return; // move up the fiber tree
      }
      if (masterArray) break;
    }
  } catch (e) {
    console.warn("Fiber scan failed, using regex fallback.");
  }

  if (masterArray) {
    console.log("%c🎯 Found Full Ecosystem Array!", "color: #2196F3; font-weight: bold;");
    console.table(masterArray);
    window.allBeraProjects = masterArray;
    console.log("Run 'copy(window.allBeraProjects)' to save all items to your clipboard.");
  } else {
    console.log("Could not find a single large array. Here are all the project names discovered in the raw stream text data:");
    console.log(uniqueNames);
  }
})();
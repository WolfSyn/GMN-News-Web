// app.js

// 1. Load shared header & footer
document.addEventListener("DOMContentLoaded", () => {
    const includes = [
      { file: "partials/header.html", id: "site-header" },
      { file: "partials/footer.html", id: "site-footer" }
    ];
  
    includes.forEach(async ({ file, id }) => {
      try {
        const resp = await fetch(file);
        if (!resp.ok) throw new Error(`Failed to load ${file}`);
        const html = await resp.text();
        document.getElementById(id).innerHTML = html;
      } catch (e) {
        console.error(e);
      }
    });
  });
  
  // 2. Your existing console message
  console.log("🚀 GMN News site is live!");
  
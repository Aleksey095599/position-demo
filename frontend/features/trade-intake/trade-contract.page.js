    const tradeContractCopyJsonButton = document.getElementById("tradeContractCopyJsonButton");
    tradeContractCopyJsonButton?.addEventListener("click", async () => {
      const example = document.getElementById("tradeContractJsonExample");
      const status = document.getElementById("tradeContractCopyJsonStatus");
      if (!example || !status) return;

      try {
        await navigator.clipboard.writeText(example.textContent);
        status.textContent = "JSON copied.";
      } catch {
        status.textContent = "Unable to copy. Select the JSON and copy it manually.";
      }
    });

    function workspaceNavMenuItems(entry, menu = entry.menu) {
      return Array.from(menu.querySelectorAll('[role="menuitem"]'))
        .filter(item => !item.closest("[hidden]") && item.closest('[role="menu"]') === menu);
    }

    function workspaceNavSubgroupPlacement(menuBounds, top, width, height, viewportWidth, viewportHeight) {
      const right = menuBounds.right + 4;
      const left = menuBounds.left - width - 4;
      const opensLeft = right + width > viewportWidth - 8;
      return {
        inline: viewportWidth <= 600 || (opensLeft && left < 8),
        opensLeft,
        left: opensLeft ? left : right,
        top: Math.max(8, Math.min(top, viewportHeight - height - 8))
      };
    }

    function positionWorkspaceNavSubgroup(toggle) {
      const group = document.getElementById(toggle.dataset.workspaceNavSubgroupToggle);
      if (group.hidden) return;
      group.classList.remove("is-inline");
      const menu = toggle.closest('[role="menu"]');
      const placement = workspaceNavSubgroupPlacement(
        menu.getBoundingClientRect(), toggle.getBoundingClientRect().top,
        group.offsetWidth, group.offsetHeight, window.innerWidth, window.innerHeight
      );
      group.classList.toggle("is-inline", placement.inline);
      toggle.classList.toggle("opens-left", !placement.inline && placement.opensLeft);
      group.style.left = `${placement.left}px`;
      group.style.top = `${placement.top}px`;
    }

    function positionWorkspaceNavSubgroups(entry) {
      entry.menu.querySelectorAll("[data-workspace-nav-subgroup-toggle]")
        .forEach(positionWorkspaceNavSubgroup);
    }

    function closeWorkspaceNavSubgroups(entry) {
      entry.menu.querySelectorAll("[data-workspace-nav-subgroup-toggle]")
        .forEach(toggle => setWorkspaceNavSubgroupOpen(toggle, false));
    }

    function setWorkspaceNavSubgroupOpen(toggle, open) {
      const group = document.getElementById(toggle.dataset.workspaceNavSubgroupToggle);
      toggle.setAttribute("aria-expanded", String(open));
      group.hidden = !open;
      if (open) positionWorkspaceNavSubgroup(toggle);
      else toggle.classList.remove("opens-left");
    }

    function syncWorkspaceNavSubgroups(activeRoute) {
      document.querySelectorAll("[data-workspace-nav-subgroup-toggle]").forEach(toggle => {
        const isActive = toggle.dataset.workspaceRoutes.split(/\s+/).includes(activeRoute);
        toggle.classList.toggle("is-active", isActive);
      });
    }

    function handleWorkspaceNavMenuClick(entry, event) {
      const toggle = event.target.closest("[data-workspace-nav-subgroup-toggle]");
      if (toggle) {
        setWorkspaceNavSubgroupOpen(toggle, toggle.getAttribute("aria-expanded") !== "true");
        positionWorkspaceNavMenu(entry);
      } else if (event.target.closest("[data-workspace-route]")) {
        setWorkspaceNavMenuOpen(entry, false);
      }
    }

    function handleWorkspaceNavMenuKeydown(entry, event) {
      const focusedItem = document.activeElement;
      const focusedGroup = focusedItem?.closest(".workspace-nav-subgroup");
      if (event.key === "Escape") {
        event.preventDefault();
        if (focusedGroup) {
          const toggle = document.getElementById(focusedGroup.getAttribute("aria-labelledby"));
          setWorkspaceNavSubgroupOpen(toggle, false);
          toggle.focus();
        } else {
          setWorkspaceNavMenuOpen(entry, false);
          entry.toggle.focus();
        }
        return;
      }

      if (event.key === "ArrowRight" && focusedItem?.dataset.workspaceNavSubgroupToggle) {
        event.preventDefault();
        setWorkspaceNavSubgroupOpen(focusedItem, true);
        const group = document.getElementById(focusedItem.dataset.workspaceNavSubgroupToggle);
        group.querySelector('[role="menuitem"]')?.focus();
        positionWorkspaceNavMenu(entry);
        return;
      }

      if (event.key === "ArrowLeft") {
        const group = focusedItem?.closest(".workspace-nav-subgroup");
        const toggle = group
          ? document.getElementById(group.getAttribute("aria-labelledby"))
          : focusedItem?.dataset.workspaceNavSubgroupToggle ? focusedItem : null;
        if (toggle) {
          event.preventDefault();
          setWorkspaceNavSubgroupOpen(toggle, false);
          toggle.focus();
          positionWorkspaceNavMenu(entry);
        }
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = workspaceNavMenuItems(entry, focusedGroup || entry.menu);
      if (!items.length) return;
      const currentIndex = items.indexOf(focusedItem);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : currentIndex < 0 ? 0
            : (currentIndex + direction + items.length) % items.length;
      if (!focusedGroup) closeWorkspaceNavSubgroups(entry);
      items[nextIndex].focus();
    }

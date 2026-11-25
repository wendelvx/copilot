(() => {
  const { DomObserver, Selectors, QuickBarUI, FollowupUI, TagsBarUI } = window.ZapCopilot;

  DomObserver.on('appReady', () => {
    console.log('[ZapCopilot] Âncoras prontas:', {
      sidebarHeaderActions: !!Selectors.getSidebarHeaderActions(),
      filtersRow: !!Selectors.getFiltersRow()
    });
  });

  QuickBarUI.init();
  FollowupUI.init();
  TagsBarUI.init();

  DomObserver.start();
})();
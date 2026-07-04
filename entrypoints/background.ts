export default defineBackground(() => {
  console.info('CleanWeb background ready', { id: browser.runtime.id });
});

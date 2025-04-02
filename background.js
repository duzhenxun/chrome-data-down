// 版本检查配置
const GITHUB_OWNER = 'duzhenxun';
const GITHUB_REPO = 'chrome-mysql2struct';
const VERSION_CHECK_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const UPDATE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// 检查新版本
async function checkForUpdates() {
  try {
    const response = await fetch(VERSION_CHECK_URL);
    const data = await response.json();
    const latestVersion = data.tag_name.replace('v', '');
    const currentVersion = chrome.runtime.getManifest().version;

    if (latestVersion > currentVersion) {
      // 更新扩展图标
      chrome.action.setBadgeText({ text: '↑' });
      chrome.action.setBadgeBackgroundColor({ color: '#FFCC00' });

      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        releaseNotes: data.body || '暂无更新说明'
      };
    }

    return { hasUpdate: false };
  } catch (error) {
    console.error('检查更新失败:', error);
    return { hasUpdate: false, error: error.message };
  }
}

// 定期检查更新（每天检查一次）
chrome.alarms.create('checkUpdate', { periodInMinutes: 24 * 60 });

// 监听定时器
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUpdate') {
    checkForUpdates();
  }
});

// 监听来自popup页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'checkUpdate') {
    checkForUpdates().then(sendResponse);
    return true; // 保持消息通道开启以支持异步响应
  } else if (request.type === 'openUpdatePage') {
    chrome.tabs.create({ url: UPDATE_URL });
  }
});

// 初始检查更新
checkForUpdates();
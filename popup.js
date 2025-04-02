// 下载管理器类
class DownloadManager {
  constructor() {
    this.isDownloading = false;
    this.initElements();
    this.bindEvents();
    this.checkForUpdates();
  }

  async checkForUpdates() {
    const updateInfo = await chrome.runtime.sendMessage({ type: 'checkUpdate' });
    if (updateInfo.hasUpdate) {
      this.showUpdateNotification(updateInfo);
    }
  }

  showUpdateNotification(updateInfo) {
    this.currentVersionSpan.textContent = updateInfo.currentVersion;
    this.latestVersionSpan.textContent = updateInfo.latestVersion;
    this.releaseNotesElem.textContent = updateInfo.releaseNotes;
    this.updateNotification.style.display = 'block';
  }

  initElements() {
    this.downloadBtn = document.getElementById('downloadBtn');
    this.urlInput = document.getElementById('urlInput');
    this.progressContainer = document.getElementById('progressContainer');
    this.progressBar = document.getElementById('progressBar');
    this.currentPageSpan = document.getElementById('currentPage');
    this.downloadedCountSpan = document.getElementById('downloadedCount');
    this.updateNotification = document.getElementById('updateNotification');
    this.currentVersionSpan = document.getElementById('currentVersion');
    this.latestVersionSpan = document.getElementById('latestVersion');
    this.releaseNotesElem = document.getElementById('releaseNotes');
    this.updateBtn = document.getElementById('updateBtn');
  }

  bindEvents() {
    this.downloadBtn.addEventListener('click', () => this.startDownload());
    this.updateBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openUpdatePage' });
    });
    document.getElementById('pasteBtn').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        this.urlInput.value = text;
      } catch (err) {
        console.error('剪贴板访问错误:', err);
        this.showPasteError();
      }
    });
    
    document.getElementById('clearBtn').addEventListener('click', () => {
      this.urlInput.value = '';
      this.urlInput.focus();
    });
  }
  
  showPasteError() {
    const tooltip = document.createElement('div');
    tooltip.className = 'paste-tooltip';
    tooltip.textContent = '无法访问剪贴板, 请手动粘贴';
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '5px 10px';
    tooltip.style.borderRadius = '5px';
    tooltip.style.fontSize = '14px';
    tooltip.style.zIndex = '1000';
    tooltip.style.top = '40px';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%)';
    
    document.body.appendChild(tooltip);
    
    setTimeout(() => {
      document.body.removeChild(tooltip);
    }, 3000);
  }
  
  async startDownload() {
    const url = this.urlInput.value.trim();
    if (!url) {
      this.showError('请输入有效的URL');
      return;
    }

    if (this.isDownloading) return;

    try {
      this.isDownloading = true;
      this.resetUI();
      await this.downloadData(url);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.resetDownloadState();
    }
  }

  async downloadData(url) {
    let page = 1;
    let allData = [];
    let lastPageData = null;
    const header = await this.getResponseHeader(url);

    while (true) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('page', page);

      const { data } = await this.fetchPageData(pageUrl);
      if (!this.isValidDataStructure(data)) break;

      const filteredData = data.column.filter(item => item.id !== '总数量');
      if (filteredData.length === 0) break;

      if (this.isDuplicatePage(filteredData, lastPageData)) {
        return this.handleDuplicateData(allData, header, page);
      }

      lastPageData = [...filteredData];
      allData.push(...filteredData);
      this.updateProgress(page++, allData.length);
    }

    return this.finalizeDownload(header, allData);
  }

  async getResponseHeader(url) {
    const initialData = await this.fetchPageData(new URL(url));
    const firstValidData = initialData.data.column.find(item => item.id !== '总数量');
    return initialData.data.header || Object.keys(firstValidData).map(key => ({ key, title: key }));
  }

  isValidDataStructure(data) {
    return data?.column?.length > 0 && data.column.some(item => item.id !== '总数量');
  }

  isDuplicatePage(currentData, lastData) {
    return lastData && currentData.some((item, index) =>
      JSON.stringify(item) !== JSON.stringify(lastData[index])
    ) === false;
  }

  handleDuplicateData(data, header, page) {
    const validData = data.slice(0, data.length - (page === 2 ? data.length : lastPageData.length));

    throw {
      type: 'duplicate',
      message: `检测到第${page}页数据重复`,
      validData,
      header,
      dataCount: validData.length
    };
  }

  finalizeDownload(header, data) {
    if (data.length === 0) throw new Error('没有可下载的数据');
    return this.generateAndDownloadCSV(header, data);
  }

  async fetchPageData(pageUrl) {
    const response = await fetch(pageUrl);
    const data = await response.json();
    if (!data || typeof data !== 'object') {
      throw new Error('返回的数据格式不正确');
    }
    return data;
  }

  isValidData(data) {
    return data && Array.isArray(data.column) && data.column !== null;
  }

  isDuplicateData(currentData, lastData) {
    return lastData && JSON.stringify(currentData) === JSON.stringify(lastData);
  }

  processHeader(header, filteredData, data) {
    if (!header && filteredData.length > 0) {
      header = data.header || Object.keys(filteredData[0]).map(key => ({ key, title: key }));
      if (header.length === 0) {
        throw new Error('无法获取数据表头');
      }
    }
    return header;
  }

  async generateAndDownloadCSV(header, allData) {
    if (allData.length === 0) {
      throw new Error('没有可下载的数据');
    }
    const csvContent = this.generateCSVContent(header, allData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);

    this.progressBar.style.width = '100%';
    await this.initiateDownload(downloadUrl);
  }

  generateCSVContent(header, allData) {
    const escapeCSV = str => `"${String(str).replace(/"/g, '""')}"`;
    const headers = header.map(h => escapeCSV(h.title || h.key));
    const rows = allData.map(item =>
      header.map(h => typeof item[h.key] === 'number'
        ? item[h.key]
        : escapeCSV(item[h.key] || ''))
    );
    return '\ufeff' + headers.join(',') + '\n' + rows.join('\n');
  }

  handleError(error) {
    if (error.validData?.length > 0) {
      this.handlePartialDownload(error.header, error.validData, error.dataCount, error.message);
    } else {
      this.showError(error.message || '下载过程中发生未知错误');
    }
  }

  handlePartialDownload(header, data, count, message) {
    this.generateAndDownloadCSV(header, data);
    this.showError(`${message}（已下载${count}条有效数据）`);
  }

  initiateDownload(downloadUrl) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: downloadUrl,
        filename: 'data_export.csv',
        saveAs: true,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        chrome.downloads.onChanged.addListener(function onChanged(delta) {
          if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
            URL.revokeObjectURL(downloadUrl);
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve();
          }
        });
      });
    });
  }

  updateProgress(page, dataCount) {
    this.currentPageSpan.textContent = page;
    this.downloadedCountSpan.textContent = dataCount;
    this.progressBar.style.width = `${Math.min((page * 10), 95)}%`;
  }

  resetUI() {
    this.currentPageSpan.textContent = '0';
    this.downloadedCountSpan.textContent = '0';
    this.progressBar.style.width = '0%';
    this.progressContainer.style.display = 'block';
    this.downloadBtn.disabled = true;
    this.downloadBtn.textContent = '不要离开,急速下载中...';
  }

  resetDownloadState() {
    this.isDownloading = false;
    this.downloadBtn.disabled = false;
    this.downloadBtn.textContent = '下载数据';
  }

  showError(message) {
    alert(message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DownloadManager();
});

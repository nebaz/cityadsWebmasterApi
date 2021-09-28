const fetch = require('node-fetch');
const CITYADS_API_URL = 'https://cityads.com/api/rest/webmaster/json/';
const STATUS_REJECTED = 'rejected';
const STATUS_OPEN = 'open';
const STATUS_APPROVED = 'approved';

class CityadsApi {

  static STATUS_REJECTED = STATUS_REJECTED;
  static STATUS_OPEN = STATUS_OPEN;
  static STATUS_APPROVED = STATUS_APPROVED;

  constructor(webmasterToken) {
    this.token = webmasterToken;
  }

  async getProfile() {
    let profile = await this.apiRequest('profile');
    profile.id = Number(profile.id);
    return profile;
  }

  async getBalance() {
    let data = await this.apiRequest('balanceinfo');
    return {
      currency: data.currency,
      mainBalance: Number(data.main_balance),
      holdAdv: Number(data.commission_hold_adv),
      holdCity: Number(data.commission_hold_city),
      availableBalance: Number(data.available_balance),
    }
  }

  async chargeHistoryList() {
    let action = 'chargehistorylist';
    let params = new Map();
    let result = [];
    let start = 0;
    let limit = 1000;
    let apiData;
    do {
      params.set('start', start);
      params.set('limit', limit);
      apiData = await this.apiRequest(action, params);
      result = result.concat(apiData.items || [])
      start++;
    } while (apiData.total > limit * start)
    return result;
  }

  async getTrafficChannels() {
    let data = await this.apiRequest('traffic_channels');
    let result = [];
    for (let i in data.items) {
      if (data.items[i].is_active === '1') {
        result.push({
          id: Number(data.items[i].id),
          name: data.items[i].name
        });
      }
    }
    return result;
  }

  async getOfferDataByOfferId(offerId) {
    return await this.apiRequest('offer/' + offerId);
  }

  async getOffersData(offerIds, channelId) {
    let action = 'offers/web';
    let params = new Map();
    if (offerIds) {
      params.set('ids', offerIds.join(','));
    }
    if (channelId) {
      params.set('traffic_channel_id', channelId);
    }
    let result = {};
    let start = 0;
    let limit = 1000;
    let apiData;
    do {
      params.set('start', start);
      params.set('limit', limit);
      apiData = await this.apiRequest(action, params);
      result = {...result, ...apiData.items};
      start++;
    } while (apiData.total > limit * start)
    return result;
  }

  async getCrByOfferId(dateFrom, dateTo, offerId, channelId = null) {
    dateFrom = this.#toCityadsFormatDate(dateFrom);
    dateTo = this.#toCityadsFormatDate(dateTo);
    let items = await this.getStatisticsOffersByOfferId(dateFrom, dateTo, offerId, channelId);
    if (!items.length) {
      return false;
    }
    let crTotal = items[0].crTotal * 100;
    let openLeads = items[0].leadsOpen;
    let clickCount = items[0].clickCount;
    return {crTotal, openLeads, clickCount};
  }

  async getLeadsByOfferId(dateFrom, dateTo, offerId = null, channelId = null, xid = '') {
    dateFrom = this.#toCityadsFormatDate(dateFrom);
    dateTo = this.#toCityadsFormatDate(dateTo);
    let action = 'orderstatistics/' + dateFrom + '/' + dateTo;
    let params = new Map();
    params.set('date_type', 'order_upload');
    if (offerId) {
      params.set('action_id', offerId);
    }
    if (channelId) {
      params.set('channel_id', channelId);
    }
    if (xid) {
      params.set('xid', xid);
    }
    let result = [];
    let start = 0;
    let limit = 1000;
    let apiData;
    do {
      params.set('start', start);
      params.set('limit', limit);
      apiData = await this.apiRequest(action, params);
      if (apiData && Array.isArray(apiData.items)) {
        apiData.items.map(item => {
          item.orderId = item.submissionID;
          item.offerId = Number(item.offerID);
          item.status = this.#getLeadStatus(item.status);
          item.commission = item.commissionApproved || item.commissionCancelled || item.commissionOpen;
          item.leadTime = this.#getTimestampByTextDate(item.leadTime);
          item.uploadTime = this.#getUploadTime(item.status, item.saleTime);
        });
        result = result.concat(apiData.items)
      }
      start++;
    } while (apiData.total > limit * start)
    return result;
  }

  /**
   * short grouped statistics by offer and chanel
   * @return items{offerId,clickCount,leadsOpen}
   */
  async getStatisticsOffersByOfferId(dateFrom, dateTo, offerId = null, channelId = null) {
    dateFrom = this.#toCityadsFormatDate(dateFrom);
    dateTo = this.#toCityadsFormatDate(dateTo);
    let action = 'statistics-offers/action_id/' + dateFrom + '/' + dateTo;
    let params = new Map();
    if (offerId) {
      params.set('action_id', offerId);
    }
    if (channelId) {
      params.set('channel_id', channelId);
    }
    // params.set('sub_group', channel_id);
    let result = [];
    let start = 0;
    let limit = 1000;
    let apiData;
    do {
      params.set('start', start);
      params.set('limit', limit);
      apiData = await this.apiRequest(action, params);
      if (apiData && Array.isArray(apiData.items)) {
        apiData.items.map(item => {
          item.offerId = Number(item.actionID) || 0;
          item.offerName = item.actionName || '';
          item.leadsRejected = 0;
          item.leadsOpen = Number(item.saleOpen) || Number(item.leadsOpen) || 0;
          item.leadsApproved = Number(item.saleApproved) || Number(item.leadsApproved) || 0;
          item.clicks = Number(item.clickCount) || 0;
          item.backUrlCount = Number(item.backUrlRedirectCount) || 0;
          item.commissionRejected = item.commissionCancelled ? Number(item.commissionCancelled.toFixed(2)) : 0;
          item.commissionOpen = item.commissionOpen ? Number(item.commissionOpen.toFixed(2)) : 0;
          item.commissionApproved = item.commissionApproved ? Number(item.commissionApproved.toFixed(2)) : 0;
        });
        result = result.concat(apiData.items)
      }
      start++;
    } while (apiData.total > limit * start)
    return result;
  }

  async getWebmasterCommissions(dateFrom, dateTo, offerId = null) {
    let stats = await this.getStatisticsOffersByOfferId(dateFrom, dateTo, offerId);
    let commissionRejected = 0;
    let commissionOpen = 0;
    let commissionApproved = 0;
    for (let item of stats) {
      commissionRejected = Number((commissionRejected + item.commissionCancelled).toFixed(2));
      commissionOpen = Number((commissionOpen + item.commissionOpen).toFixed(2));
      commissionApproved = Number((commissionApproved + item.commissionApproved).toFixed(2));
    }
    return {commissionRejected, commissionOpen, commissionApproved};
  }

  async getOfferLinksByOfferId(offerId, channelId) {
    let action = 'offer-links/' + offerId;
    let params = new Map();
    if (channelId) {
      params.set('traffic_channel_id', channelId);
    }
    let result = await this.apiRequest(action, params);
    if (result && Array.isArray(result.items)) {
      return result.items.filter(item => item.is_default);
    }
    return false;
  }

  #toCityadsFormatDate(timestamp) {
    let mm = new Date(timestamp).getMonth() + 1;
    let dd = new Date(timestamp).getDate();
    return [new Date(timestamp).getFullYear(), (mm > 9 ? '' : '0') + mm, (dd > 9 ? '' : '0') + dd].join('-');
  }

  #getUploadTime(status, saleTime) {
    if (status === STATUS_APPROVED) {
      return saleTime ? this.#getTimestampByTextDate(saleTime) : Date.now();
    }
    if (status === STATUS_REJECTED) {
      return Date.now();
    }
    return null;
  }

  #getLeadStatus(status) {
    switch (status) {
      case 'Open':
      case 'Открытая':
        return STATUS_OPEN;
      case 'Одобрена':
      case 'Approved':
        return STATUS_APPROVED;
      case 'Отклонена':
      case 'Rejected':
        return STATUS_REJECTED;
      default:
        return status;
    }
  }

  #getTimestampByTextDate(datetime) {
    if (!datetime) {
      return null;
    }
    datetime = datetime.split(' ');
    let date = datetime[0].split('.');
    return Date.parse(date[2] + '-' + date[1] + '-' + date[0] + ' ' + datetime[1] + ' ' + datetime[2]);
  }

  async apiRequest(action, params = new Map()) {
    params.set('remote_auth', this.token)
    let url = new URL(action, CITYADS_API_URL).toString() + '?' + new URLSearchParams(params).toString();
    // console.info('cityApiRequest', new Date().toLocaleString(), url);
    let result;
    try {
      result = await (await fetch(url)).json();
    } catch (e) {
      console.error('cityads api error', e);
      return false;
    }
    // console.info('cityResult', new Date().toLocaleString(), result);
    if (!result.error && result.status === 200 && result.data) {
      return result.data;
    }
    return false;
  }

}

module.exports = CityadsApi;

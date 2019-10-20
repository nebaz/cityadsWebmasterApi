const fetch = require('node-fetch');
const CITYADS_API_URL = 'https://cityads.com/api/rest/webmaster/json/';
const STATUS_REJECTED = 'rejected';
const STATUS_OPEN = 'open';
const STATUS_APPROVED = 'approved';

Date.prototype.yyyymmdd = function () {
  let mm = this.getMonth() + 1;
  let dd = this.getDate();
  return [this.getFullYear(), (mm > 9 ? '' : '0') + mm, (dd > 9 ? '' : '0') + dd].join('-');
};

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

  async getTrafficChannels() {
    let data = await this.apiRequest('traffic_channels');
    let result = [];
    for (let i in data.items) {
      if (data.items[i].is_active === '1') {
        result.push(Number(data.items[i].id));
      }
    }
    return result;
  }

  async getOfferDataByOfferId(offerId) {
    return await this.apiRequest('offer/' + offerId);
  }

  async getCrByOfferId(dateFrom, dateTo, offerId, channelId = null) {
    dateFrom = new Date(dateFrom).yyyymmdd();
    dateTo = new Date(dateTo).yyyymmdd();
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
    dateFrom = new Date(dateFrom).yyyymmdd();
    dateTo = new Date(dateTo).yyyymmdd();
    let params = 'orderstatistics/' + dateFrom + '/' + dateTo + '?limit=5000&date_type=order_upload&';
    if (offerId) {
      params += 'action_id=' + offerId + '&';
    }
    if (channelId) {
      params += 'channel_id=' + channelId + '&';
    }
    if (xid) {
      params += 'xid=' + xid;
    }
    let result = await this.apiRequest(params);
    if (result && Array.isArray(result.items)) {
      result.items.map(item => {
        item.orderId = item.submissionID;
        item.offerId = Number(item.offerID);
        item.status = this.getLeadStatus(item.status);
        item.leadTimestamp = this.getTimestampByTextDate(item.leadTime);
        item.saleTimestamp = this.getTimestampByTextDate(item.saleTime);
        item.commission = item.commissionApproved || item.commissionCancelled || item.commissionOpen;
      });
      return result.items;
    }
    return false;
  }

  /**
   * short grouped statistics by offer and chanel
   * @return items{offerId,clickCount,leadsOpen}
   */
  async getStatisticsOffersByOfferId(dateFrom, dateTo, offerId = null, channelId = null) {
    dateFrom = new Date(dateFrom).yyyymmdd();
    dateTo = new Date(dateTo).yyyymmdd();
    let params = 'statistics-offers/action_id/' + dateFrom + '/' + dateTo + '?limit=1000&';
    if (offerId) {
      params += 'action_id=' + offerId + '&';
    }
    if (channelId) {
      params += 'channel_id=' + channelId;
    }
    // params += '&sub_group=channel_id';
    let result = await this.apiRequest(params);
    if (result && Array.isArray(result.items)) {
      result.items.map(item => {
        item.offerId = Number(item.actionID) || 0;
        item.offerName = item.actionName || '';
        item.leadsOpen = Number(item.saleOpen) || Number(item.leadsOpen) || 0;
        item.leadsApproved = Number(item.saleApproved) || Number(item.leadsApproved) || 0;
        item.clickCount = Number(item.clickCount) || 0;
        item.backUrlCount = Number(item.backUrlRedirectCount) || 0;
        item.commissionCancelled = item.commissionCancelled ? Number(item.commissionCancelled.toFixed(2)) : 0;
        item.commissionOpen = item.commissionOpen ? Number(item.commissionOpen.toFixed(2)) : 0;
        item.commissionApproved = item.commissionApproved ? Number(item.commissionApproved.toFixed(2)) : 0;
      });
      return result.items;
    }
    return false;
  }

  async getWebmasterCommissions(dateFrom, dateTo, offerId = null) {
    let stats = await this.getStatisticsOffersByOfferId(dateFrom, dateTo, offerId);
    let commissionApproved = 0;
    let commissionOpen = 0;
    let commissionCancelled = 0;
    for (let item of stats) {
      commissionApproved = Number((commissionApproved + item.commissionApproved).toFixed(2));
      commissionOpen = Number((commissionOpen + item.commissionOpen).toFixed(2));
      commissionCancelled = Number((commissionCancelled + item.commissionCancelled).toFixed(2));
    }
    return {commissionOpen, commissionApproved, commissionCancelled};
  }


  async getOfferLinksByOfferId(offerId, trafficChannelId) {
    let params = 'offer-links/' + offerId;
    if (trafficChannelId) {
      params += '?traffic_channel_id=' + trafficChannelId;
    }
    let result = await this.apiRequest(params);
    if (result && Array.isArray(result.items)) {
      return result.items.filter(item => item.is_default);
    }
    return false;
  }

  getLeadStatus(status) {
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

  getTimestampByTextDate(datetime) {
    if (!datetime) {
      return null;
    }
    datetime = datetime.split(' ');
    let date = datetime[0].split('.');
    return Date.parse(date[2] + '-' + date[1] + '-' + date[0] + ' ' + datetime[1] + ' ' + datetime[2]);
  }

  async apiRequest(params) {
    let url = CITYADS_API_URL + params + (params.includes('?') ? '&' : '?') + 'remote_auth=' + this.token;
    // console.info('cityApiRequest', new Date().toLocaleString(), url);
    let result;
    try {
      result = await (await fetch(url)).json();
    } catch(e) {
      console.error('cityads api error', e);
    }
    // console.info('cityResult', new Date().toLocaleString());
    if (!result.error && result.status === 200 && result.data) {
      return result.data;
    }
    return false;
  }

}

module.exports = CityadsApi;

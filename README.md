# Cityads API Integration

## Installation

To use the library, install it through [npm](https://npmjs.com)

```shell
npm install --save cityads-webmaster-api
```

## Get API token
* https://cityads.com/publisher/api

## Usage
    const CityadsApi = require('cityads-webmaster-api');
    const api = new CityadsApi(token);
    let links = await api.getOfferLinksByOfferId(29028);

## API
* getLeadsByOfferId(timestamp dateFrom, timestamp dateTo, int offerId, int channelId): Array< Object >
* getStatisticsOffersByOfferId(timestamp dateFrom, timestamp dateTo, int offerId, int channelId): Object
* getWebmasterCommissions(timestamp dateFrom, timestamp dateTo, int offerId): Object
* getOfferLinksByOfferId(int offerId, int channelId): Object
* getBalance(): Object
* getTrafficChannels(): Array< Number >
* getCrByOfferId(timestamp dateFrom, timestamp dateTo, int offerId): Object
* apiRequest(params) - native cityads api request
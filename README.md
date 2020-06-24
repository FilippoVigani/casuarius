# casuarius
Telegram bot to send messages to groups you are not part of

## Install
First, install the [Firebase CLI](https://firebase.google.com/docs/cli) and [Nodejs](https://nodejs.org/en/download/).

Then `cd functions`.

To install the application, run `npm install`.

Then, run `firebase functions:config:set bot.token=<YOUR_TELEGRAM_BOT_TOKEN> bot.url=<YOUR_WEBHOOK_URL>`. This will allow the app to send messages with your bot, and allow you to setup the webhook more easily later on.

To update the webhook, make an HTTPS request to the url of your cloud function. E.g. `GET https://your_region-your_project_name.cloudfunctions.net/webhook?token=YOUR_TELEGRAM_BOT_TOKEN&url=YOUR_WEBHOOK_URL`. If the `url` query parameter is omitted, the webhook url in the firebase config will be used.

To deploy the project to Firebase, run `npm run deploy`

To run locally, first install [ngrok](https://ngrok.com/download), then run `npm run serve`. This will start a firebase emulator and bind it to a local address with the port 5001. After doing so, run `ngrok http 5001` to forward requests from a remote https url to your local machine on port 5001. The output of the command will display a generated https url, i.e. `https://randomstring.ngrok.io`. You can now set the telegram bot webhook to the https url `https://randomstring.ngrok.io/your_project_name/your_region/bot`.

# homebridge-whirlpool

[![npm version](https://img.shields.io/npm/v/homebridge-whirlpool.svg)](https://www.npmjs.com/package/homebridge-whirlpool)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-whirlpool.svg)](https://www.npmjs.com/package/homebridge-whirlpool)
[![license](https://img.shields.io/npm/l/homebridge-whirlpool.svg)](LICENSE)

A [Homebridge](https://homebridge.io) plugin that connects your **Whirlpool**, **Maytag**, or **KitchenAid** washer and dryer to Apple HomeKit via the Whirlpool cloud API.

Each appliance shows up in HomeKit as an **Outlet**:

- **On** — the appliance is running a cycle
- **Off** — the appliance is idle, paused, or finished

This lets you see at a glance whether the laundry is running and build automations such as *"notify me when the dryer finishes."*

> **Read-only:** appliance state is reported only. You cannot start or stop a cycle from HomeKit — attempts to toggle the outlet are rejected. This mirrors what the Whirlpool cloud API exposes.

## Requirements

- [Homebridge](https://homebridge.io) v2.0.0 or later
- Node.js 22 or 24
- A Whirlpool / Maytag / KitchenAid account with your appliance(s) registered in the corresponding mobile app

## Installation

Install through the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) by searching for **homebridge-whirlpool**, or from the command line:

```sh
npm install -g homebridge-whirlpool
```

## Configuration

Add the platform via the Homebridge UI, or add a block to the `platforms` array of your `config.json`:

```json
{
  "platforms": [
    {
      "platform": "WhirlpoolCloud",
      "name": "Whirlpool Cloud",
      "username": "you@example.com",
      "password": "your-app-password",
      "brand": "maytag",
      "pollSeconds": 60,
      "includeAll": false
    }
  ]
}
```

### Options

| Option        | Required | Default          | Description |
|---------------|----------|------------------|-------------|
| `platform`    | yes      | —                | Must be `WhirlpoolCloud`. |
| `name`        | yes      | `Whirlpool Cloud`| Platform name shown in Homebridge logs. |
| `username`    | yes      | —                | The email you use to sign in to the Whirlpool / Maytag / KitchenAid app. |
| `password`    | yes      | —                | Your app login password. |
| `brand`       | no       | `maytag`         | The app you sign in with: `maytag`, `whirlpool`, or `kitchenaid`. |
| `pollSeconds` | no       | `60`             | How often (in seconds) to poll appliance status. Minimum `30`. |
| `includeAll`  | no       | `false`          | When `false`, only washers and dryers are exposed. Set `true` to expose all appliance types on the account. |

## How it works

The plugin authenticates against the Whirlpool cloud API (`api.whrcloud.com`) using your app credentials, discovers the appliances on your account, and polls each one for its current machine state. Machine states reported as *Running* or *Running (Post-Cycle)* map to the outlet's **On** state; everything else maps to **Off**.

By default only laundry appliances (washers and dryers) are exposed. If your account has other connected appliances and you want them surfaced too, set `includeAll` to `true`.

## Troubleshooting

- **No appliances found** — make sure your appliances are registered and visible in the mobile app for the `brand` you configured. Try setting `includeAll` to `true` and check the Homebridge log for the list of detected appliances and their categories.
- **Authentication failed** — double-check the email/password, and confirm the `brand` matches the app you actually sign in with.
- **Account is locked (HTTP 423)** — unlock the account by signing in through the mobile app, then restart Homebridge.

Enable Homebridge debug mode (`homebridge -D`) to see detailed polling and state-mapping logs.

## Disclaimer

This is an unofficial plugin and is not affiliated with, endorsed by, or supported by Whirlpool Corporation. "Whirlpool", "Maytag", and "KitchenAid" are trademarks of their respective owners. Use at your own risk.

## License

[MIT](LICENSE) © Josh Marr

# Gmail Inbox — Connecting Google (one-time setup)

Before anyone can add a Gmail account in the [app](charmiq://./README.md), an administrator does this one-time setup: create a Google OAuth client, register it with CharmIQ as an **OAuth Integration**, and enable the Gmail API. The app itself never handles these credentials — it calls the CharmIQ bridge, which resolves the Integration you set up here.

> You do this once per Google project. The same OAuth Integration works for any CharmIQ app that connects to Google — it isn't specific to this app.


## 1. Create a Google OAuth client

- [Create a Google Cloud project](https://developers.google.com/workspace/guides/create-project) (or use an existing one).
- Under [Credentials](https://console.cloud.google.com/apis/credentials) — check the project name at the top is the one you expect — click **Create Credentials → OAuth client ID**.

<p align="center"><img width="496" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FzHT8qnaAU5ig37uqTS81?alt=media&token=da9021ef-6c96-431d-8d0d-32eccf0f99ec" /></p>

- Set **Application type** to **Web application**.

<p align="center"><img width="271" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2F57Gtv200z53C0JzyphSl?alt=media&token=83ba9a57-35e8-4d71-ae45-fa72be825ee7" /></p>

- Give it a name (e.g. `CharmIQ OAuth`).
- Add an **Authorized JavaScript origin** of `https://team.charmiq.ai`.
- Add an **Authorized redirect URI** of `https://team.charmiq.ai/oauth/callback`.
- Click **Create** — and **leave the dialog open**; you copy the Client ID and secret from it in the next step.


## 2. Register it with CharmIQ (OAuth Integration)

- **Individual plans:** go to [Settings → OAuth Integrations](https://team.charmiq.ai/settings/oauth-integrations) and click **New**.

<p align="center"><img width="452" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FDz9RmqiHQR1kczsBEBY1?alt=media&token=1d358f45-9e1b-4703-8b52-05bc87d645b1" /></p>

- **Company plans:** go to **Company → OAuth Integrations** and click **New**.

<p align="center"><img width="459" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FDVvuCi2WBeiUUiG3HAKe?alt=media&token=a189496b-f953-44d1-8b3b-61ed165c0173" /></p>

- Enter a name (e.g. matching the Google project above).

<p align="center"><img width="300" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FGdP59EaK0eoajAxT3hRm?alt=media&token=0a050a68-7435-4528-92f7-9234a51a8068" /></p>

- Copy the **Client ID** from the Google dialog into the **Client ID** field.
- Copy the **Client secret** from the Google dialog into the **Client Secret** field.

> **Save the Client Secret in a password manager too.** CharmIQ cannot show it again once saved.


## 3. Enable the Gmail API

In the [Google Cloud API dashboard](https://console.cloud.google.com/apis/dashboard):

- Click **Enable APIs and services**.

<p align="center"><img width="300" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FOez3iZxgg1V4TT1inD0h?alt=media&token=99e91fcc-a6d4-47e7-b226-6a6837dfeac9" /></p>

- Search for `gmail`.

<p align="center"><img width="300" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FVsaxsSoyTojaFrtzgIQe?alt=media&token=01b193b0-37cc-431e-955e-fc7476d67a66" /></p>

- Select the **Gmail API**.

<p align="center"><img width="515" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2F9na5VlsVKWzmYtq9Nnni?alt=media&token=d63edc27-2802-4dfa-b064-6df9bbbc8755" /></p>

- Click **Enable**.

<p align="center"><img width="300" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FDPOTwCYO8012zJkuMcLU?alt=media&token=eb5c7282-691b-4216-905a-5a9d25bf630c" /></p>


## 4. The "unverified app" warning

Unless you complete Google's [verification process](https://support.google.com/cloud/answer/13463073?hl=en), the first time someone connects an account through your Integration they see this warning:

<p align="center"><img width="386" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FtC5o3ZntagEHOzMz92Jv?alt=media&token=323c7f2b-7b90-400b-9b23-bdc7018e1de7" /></p>

Click **Advanced**:

<p align="center"><img width="465" src="https://firebasestorage.googleapis.com/v0/b/platform-prod-390720.appspot.com/o/a%2FoIAIJz43eqWLDyUxW7CMOYnj0Md2%2FTG8kgO10pVzEdlwrhsiX?alt=media&token=76819328-1742-4d03-9961-797269045db1" /></p>

…then click **Go to team.charmiq.ai (unsafe)** to continue to the Google sign-in.


## Done

Once the Integration exists and the Gmail API is enabled, open the [Gmail Inbox](charmiq://./README.md), click **Add account**, and CharmIQ resolves your Integration, opens the Google sign-in, and connects the account read-only.

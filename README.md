# The Lounge Pushover Plugin

A notification plugin for [The Lounge](https://thelounge.chat) that sends mobile alerts via [Pushover](https://pushover.net) when your username is mentioned in IRC channels or via a direct message

## Acknowledgements

This project is based on [thelounge-plugin-ntfy](https://github.com/cy1der/thelounge-plugin-ntfy), which is licensed under the MIT License.

Modifications include removing [ntfy](https://ntfy.sh) related logic and replacing it with Pushover specific logic.

If you would prefer to use ntfy for notifications, I would recommend their plugin.

## Installation

Via the `thelounge` command line:

```bash
thelounge install thelounge-plugin-pushover
```

## Setup

1. You can see all available commands by running

```
/pushover
```

2. Set your pushover user key with

```
/pushover config set user <user key>
```

3. Set your pushover app token with

```
/pushover config set token <app token>
```

4.  (Optional) Enable direct message notifications

```
/pushover config set notify_on_pms true
```

5.  You can double check your config with

```
/pushover config print
```

6. Test your connection with

```
/pushover test
```

7. If your test notification works, run

```
/pushover start
```

8. You can see whether or not the plugin is running with

```
/pushover status
```

9. Finally you can stop the plugin by running

```
/pushover stop
```

## Development

### Running the tests

Tests use Node's built-in test runner and [nock](https://github.com/nock/nock) for HTTP mocking. No extra setup required.

```bash
node --test tests/index.test.js
```

### Install the plugin

1. Clone the repo

2. Create a docker container of the lounge by running:

```bash
docker compose up --detach
```

3. Create a folder named `thelounge-plugin-pushover` and a sub folder `src` in the `packages` subdirectory:

```bash
mkdir -p thelounge/packages/thelounge-plugin-pushover/src
```

4. Symlink the files from the project into the packages folder:

```bash
ln package.json thelounge/packages/thelounge-plugin-pushover/package.json
ln index.js thelounge/packages/thelounge-plugin-pushover/index.js
ln src/command.js thelounge/packages/thelounge-plugin-pushover/src/command.js
ln src/config.js thelounge/packages/thelounge-plugin-pushover/src/config.js
ln src/handler.js thelounge/packages/thelounge-plugin-pushover/src/handler.js
ln src/pushover.js thelounge/packages/thelounge-plugin-pushover/src/pushover.js
```

5. Install the plugin

```bash
docker exec -it thelounge sh -c "su node -c 'thelounge install file:/var/opt/thelounge/packages/thelounge-plugin-pushover'"
```

This command should print the following:

```
[INFO] Retrieving information about the package...
[INFO] Installing file:/var/opt/thelounge/packages/thelounge-plugin-pushover...
[INFO] file:/var/opt/thelounge/packages/thelounge-plugin-pushover has been successfully installed.
```

After it is installed you should see the following message in the container's logs:

```
Package thelounge-plugin-pushover vX.Y.Z loaded
```

### Test it works

1. Create a user

```bash
docker exec -it thelounge sh -c "thelounge add admin"
```

2. Log in as this user to http://localhost:9000
3. Log in to an irc network, see [Testing with a local IRC server](#testing-with-a-local-irc-server) if you don't have one.
4. Set your pushover credentials

```
/pushover config set token <app token>
/pushover config set user <user key>
```

5. Run the test command to see if you get a notification

```
/pushover test
```

### Step Debugging

1. If you want to enable step debugging you need to uncomment the environmental variable lines in the `compose.yaml` file:

```yaml
# Uncomment for debugging
environment:
    - 'NODE_OPTIONS=--inspect=0.0.0.0:9229'
```

2. Stick a `debugger;` statement in the `onServerStart(tl)` function

3. Stop the container, run the 'Attach The Lounge' vscode debug profile, and then restart the docker container.

4. You should see a log `Debugger listening on ws://0.0.0.0:9229/...` and the debugger should stop on the breakpoint

### Testing with a local IRC server

1. Create an Ergo docker container

```bash
docker run --init --name ergo -d -p 6667:6667 -p 6697:6697 ghcr.io/ergochat/ergo:stable
```

2. Connect to it via the lounge

| Setting                         | Value                |
| ------------------------------- | -------------------- |
| Name                            | Ergo                 |
| Server                          | host.docker.internal |
| Port                            | 6667                 |
| Password                        | blank                |
| Use Secure Connection           | false                |
| Only allow trusted certificates | false                |
| Enable Proxy                    | false                |
| Authentication                  | No authentication    |

### Testing two users talking with each other locally

1. Create a new lounge docker container and connect to the irc server via the same credentials

```bash
docker run --detach --name thelounge2 --publish 9001:9000 ghcr.io/thelounge/thelounge:latest
```

2. In one of the lounge instances, set the pushover config with your user key and app token

```
/pushover config set token <app token>
/pushover config set user <user key>
```

3. Run the test command to see if you get a notification

```
/pushover test
```

4. Switch over to the other lounge instance and try mentioning your user's name in a channel. If everything is working, you should get a notification.

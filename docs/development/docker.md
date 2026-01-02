# Running Development Environment in Docker

> **Contributing note:** These instructions assume Rocky Linux 9.x (tested on Rocky 9.5). Using Rocky 9 is recommended for contributors, but you can adapt the steps for other operating systems — adjust package manager and service commands as needed.

## Installation

### Start with Rocky 9 fully updated.
`dnf update -y; reboot`

### Next we will install Docker-CE, and the docker-compose-plugin.
```
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### Enable docker
```
systemctl enable docker
systemctl start docker
```

### Link the docker-compose binary so it is in the path
`ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/bin/docker-compose`

### Now install a few dependencies for building Ascender
`dnf install -y git make ansible-core npm`

### !!!! Add your github ssh key to the box !!!!!
### be sure it is chmod 600
[https://github.com/settings/keys](https://github.com/settings/keys)

### Lets clone Ascender
`git clone git@github.com:ctrliq/ascender.git`

### You can otherwise open ports 3001, 8043, and a few others
```
systemctl stop firewalld
systemctl disable firewalld
```

### NPM runs on 3001
### API runs on 8043   so https://ip:8043/api/
### We will now create some scripts to make starting the containers and npm easier
```
cat << EOF > ~/start_containers.sh
#!/bin/bash
cd ascender
export RECEPTOR_IMAGE=quay.io/ansible/receptor:v1.4.9
make docker-compose-build
make docker-compose
EOF
```

```
cat << EOF > ~/start_npm.sh
#!/bin/bash
cd ascender
#npm --prefix=awx/ui install
# If using openssl-3.0.7 or earlier, uncomment the next line and comment out the one after it.
export NODE_OPTIONS=--openssl-legacy-provider; npm --prefix=awx/ui start
#npm --prefix=awx/ui start
EOF
```

```
chmod +x ~/start_containers.sh
chmod +x ~/start_npm.sh
```

You will need to start the containers, and then once they are up, start npm in a new terminal window.


## Default Password
When starting containers, after migrations are done, it will randomly generate a password for the admin user, you will see it in the logs.  If you change the password, it will still state in the logs that the password is the randomly generated one, but your new one will be the actual one to work.

```
tools_awx_1   	|   Applying social_django.0015_rename_extra_data_new_usersocialauth_extra_data... OK
tools_awx_1   	|   Applying social_django.0016_alter_usersocialauth_extra_data... OK
tools_awx_1   	|   Applying sso.0001_initial... OK
tools_awx_1   	|   Applying sso.0002_expand_provider_options... OK
tools_awx_1   	|   Applying sso.0003_convert_saml_string_to_list... OK
tools_awx_1   	| Superuser created successfully.
tools_awx_1   	| Admin password: vHwSodfHzdssZwQduUrAYMn
```

The default user is "***admin***".  
Once the npm server is running, you can then login to Ascender at the IP/port provided


## Package Updates for Backend Components

When you have python packages to update due to upstream or dependency CVE remediation, use the following procedure:

1. Checkout the `main` branch in your docker environment
2. From there, create a new branch to handle the CVE changes
3. Start the containers using `./start_containers.sh`
4. Login to the ascender web container using
`docker exec -it tools_awx_1 /bin/bash`
5. Change to the `requirements` directory and update `requirements.in`
6. While still in the container, run the `./updates.sh run` command to update the `requirements.txt`
7. Exit the container
8. Check the `Makefile` in the root of the ascender repo for required changes that align with your changes in requirements.in (for setuptools, etc...)
9. Shutdown your `./start_containers.sh` script by breaking out of the shell using `ctrl-C`
10. Restart the `./start_containers.sh` and once restarted, check for fatal errors, and perform a UI regression test.

## Package Update for the Ascender UI

When you have npm packages to update due to upstream or dependency CVE remediation, use the following procedure:

1. Checkout the `main` branch in your docker environment
2. From there, create a new branch to handle the CVE changes
3. Start the containers using `./start_containers.sh`
4. Before starting the user interface using `./start_npm.sh`, login to the web container and goto the `awx/ui` directory and update the `package.json` file with the new package requirements
5. Run `npm audit fix` to see if there are any other security changes to be made as a result of the updated packages.
6. If that runs clean, start the user interface using `./start_npm.sh`
7. Check for startup errors and run your regressions
8. Once changes are verified good, commit your changes to the branch you created in step 2.
9. Create a pull request to `main`

## Running Unit Tests

1. start the containers
2. do not start npm
3. enter the `tools_awx_1` container
4. `cd tools/docker-compose`
5. `./start_tests.sh test_coverage`


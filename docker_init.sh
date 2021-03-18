#!/bin/bash

# replace original url to new one
if [ "${ARTIPUB_API_ADDRESS}" = "" ];
then
	:
else
	jspath=`ls /frontend/umi.*.js`
	sed -i "s?http://localhost:3000?${ARTIPUB_API_ADDRESS}?g" ${jspath}
fi

# start backend
yarn run prod

# start frontend
serve /frontend -l 8000


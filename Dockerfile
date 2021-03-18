FROM jelastic/nodejs:14.16.0-npm AS frontend

WORKDIR /app
ADD ./frontend /app
RUN yarn config set registry https://registry.npm.taobao.org -g
RUN yarn
RUN yarn run build

FROM jelastic/nodejs:14.16.0-npm
RUN yum install -y nginx && yum clean all
COPY --from=frontend /app/dist /frontend
WORKDIR /app
ADD ./backend ./docker_init.sh ./nginx /app/
RUN yarn config set registry https://registry.npm.taobao.org -g
RUN yarn
RUN yarn run build-nomap
RUN yarn global add serve

EXPOSE 3000 8000
CMD /app/docker_init.sh


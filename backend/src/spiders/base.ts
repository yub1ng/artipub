import PCR = require( 'puppeteer-chromium-resolver');
const ObjectId = require('bson').ObjectId;
import models from '../models'
import constants from '../constants'
import config from './config'
import logger from '../logger'
import type { Page } from 'puppeteer-core';
import axios from 'axios';

class BaseSpider {
  taskId: any;
  platformId: any;
  task: any;
  article: any;
  platform: any;
  browser: any;
  pcr: ReturnType<typeof PCR>;
  page: Page;
  status: { loggedIn: boolean; completedEditor: boolean; published: boolean; };
  footerContent: { richText: string; };
  urls: any;
  loginSel: any;
  publishNavigationChange: any;
  editorSel: any;

  constructor(taskId, platformId) {
    // 任务ID
    this.taskId = taskId;

    // 平台ID
    this.platformId = platformId;
  }

  async init() {
    // 任务
    this.task = await models.Task.findOne({ _id: ObjectId(this.taskId) });
    if (!this.task) {
      throw new Error(`task (ID: ${this.taskId}) cannot be found`);
    }

    // 文章
    this.article = await models.Article.findOne({ _id: this.task.articleId });
    if (!this.article) {
      throw new Error(`article (ID: ${this.task.articleId.toString()}) cannot be found`);
    }

    // 平台
    this.platform = await models.Platform.findOne({ _id: this.task.platformId });
    if (!this.platform) {
      throw new Error(`platform (ID: ${this.task.platformId.toString()}) cannot be found`);
    }

    // PCR
    this.pcr = await PCR({
      revision: '',
      detectionPath: '',
      folderName: '.chromium-browser-snapshots',
      hosts: ['https://storage.googleapis.com', 'https://npm.taobao.org/mirrors'],
      retry: 3,
      silent: false,
    });

    // 是否开启chrome浏览器调试
    const enableChromeDebugEnv = await models.Environment.findOne({ _id: constants.environment.ENABLE_CHROME_DEBUG });
    const enableChromeDebug = enableChromeDebugEnv.value;

    // 浏览器
    this.browser = await this.pcr.puppeteer.launch({
      executablePath: this.pcr.executablePath,
      //设置超时时间
      timeout: 120000,
      //如果是访问https页面 此属性会忽略https错误
      ignoreHTTPSErrors: true,
      // 打开开发者工具, 当此值为true时, headless总为false
      devtools: false,
      // 关闭headless模式, 不会打开浏览器
      headless: enableChromeDebug !== "Y",
      args: ["--no-sandbox", '--start-maximized'],
      defaultViewport: null,

    });

    // 页面
    this.page = await this.browser.newPage();

    // 状态
    this.status = {
      loggedIn: false,
      completedEditor: false,
      published: false,
    };

    // 配置
    const platformConfig = config[this.platform.name];
    if (!platformConfig) {
      throw new Error(`config (platform: ${this.platform.name}) cannot be found`);
    }

    Object.assign(this, platformConfig);

    // 脚注内容
    this.footerContent = {
      richText: ``,
    };
  }

  async initForCookieStatus() {
    // platform
    this.platform = await models.Platform.findOne({ _id: ObjectId(this.platformId) });

    // PCR
    this.pcr = await PCR({
      revision: '',
      detectionPath: '',
      folderName: '.chromium-browser-snapshots',
      hosts: ['https://storage.googleapis.com', 'https://npm.taobao.org/mirrors'],
      retry: 3,
      silent: false,
    });

    // 是否开启chrome浏览器调试
    const enableChromeDebugEnv = await models.Environment.findOne({ _id: constants.environment.ENABLE_CHROME_DEBUG });
    const enableChromeDebug = enableChromeDebugEnv.value;

    // 浏览器
    this.browser = await this.pcr.puppeteer.launch({
      executablePath: this.pcr.executablePath,
      //设置超时时间
      timeout: 120000,
      //如果是访问https页面 此属性会忽略https错误
      ignoreHTTPSErrors: true,
      // 打开开发者工具, 当此值为true时, headless总为false
      devtools: false,
      // 关闭headless模式, 不会打开浏览器
      headless: enableChromeDebug !== 'Y',
      args: [
        '--no-sandbox',
      ],
    });

    // 页面
    this.page = await this.browser.newPage();

    // // 设置屏幕大小
    // await this.page.setViewport({
    //   width: 2400,
    //   height: 1600,
    // });
  }

  /**
   * 登陆网站
   */
  async login() {
    logger.info(`logging in... navigating to ${this.urls.login}`);
    await this.page.goto(this.urls.login);
    let errNum = 0;
    while (errNum < 10) {
      try {
        await this.page.waitForTimeout(1000);
        const elUsername = await this.page.$(this.loginSel.username);
        const elPassword = await this.page.$(this.loginSel.password);
        const elSubmit = await this.page.$(this.loginSel.submit);
        await elUsername!.type(this.platform.username);
        await elPassword!.type(this.platform.password);
        await elSubmit!.click();
        await this.page.waitForTimeout(3000);
        break;
      } catch (e) {
        errNum++;
      }
    }

    // 查看是否登陆成功
    this.status.loggedIn = errNum !== 10;

    if (this.status.loggedIn) {
      logger.info('Logged in');
    }
  }

  /**
   * 设置Cookie
   */
  async setCookies() {
    const cookies = await models.Cookie.find({ domain: this.getCookieDomainCondition() });
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i];
      await this.page.setCookie({
        name: c.name,
        value: c.value,
        domain: c.domain,
      });
    }
  }

  /**
   * 获取可给axios 使用的cookie
   */
  async getCookiesForAxios() {
    const cookies = await models.Cookie.find({ domain: this.getCookieDomainCondition() });
    let cookieStr = '';
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i];
      cookieStr += `${c.name}=${c.value};`;
    }
    return cookieStr;
  }

  /**
   * 域查询条件
   */
  getCookieDomainCondition() {
    return { $regex: this.platform.name };
  }

  /**
   * 导航至写作页面
   */
  async goToEditor() {
    logger.info(`navigating to ${this.urls.editor}`);
    await Promise.all([
      this.page.goto(this.urls.editor),
      this.page.waitForNavigation({
        waitUntil: ['load', 'domcontentloaded', 'networkidle2']
      })
    ]);

    await this.afterGoToEditor();
  }

  /**
   * 导航至写作页面后续操作
   */
  async afterGoToEditor() {
    // 导航至写作页面的后续处理
    // 掘金等网站会先弹出Markdown页面，需要特殊处理
  }

  /**
   * 输入文章标题
   */
  async inputTitle(article, editorSel, task) {
    const el = document.querySelector(editorSel.title);
    el.focus();
    el.select();
    document.execCommand('delete', false);
    document.execCommand('insertText', false, task.title || article.title);
  }

  /**
   * 输入文章内容
   */
  async inputContent(article: { content: string | undefined; }, editorSel: { content: string; }) {
    const el = document.querySelector(editorSel.content) as HTMLPreElement;
    el.focus();
    try {
      //@ts-ignore 不知道为什么识别不了select
      HTMLPreElement.prototype.select = function () {
        let range = document.createRange();
        range.selectNodeContents(this);

        let sel = window.getSelection();
        sel!.removeAllRanges();
        sel!.addRange(range);
      }
      //@ts-ignore
      el.select();
    } catch (e) {
      // do nothing
    }
    document.execCommand('delete', false);
    document.execCommand('insertText', false, article.content);
  }

  /**
   * 输入文章脚注
   */
  async inputFooter(article, editorSel) {
    const footerContent = ``;
    const el = document.querySelector(editorSel.content);
    el.focus();
    document.execCommand('insertText', false, footerContent);
  }

  /**
   * 输入编辑器
   */

  async inputEditor() {
    logger.info(`input editor title`);
    // 输入标题
    await this.page.evaluate(this.inputTitle, this.article, this.editorSel, this.task);

    // 输入内容
    logger.info(`input editor  content`);
    await this.page.evaluate(this.inputContent, this.article, this.editorSel);
    await this.page.waitForTimeout(3000);

    // 输入脚注
    await this.page.evaluate(this.inputFooter, this.article, this.editorSel);
    await this.page.waitForTimeout(3000);

    // 后续处理
    await this.afterInputEditor();
  }

  /**
   * 输入编辑器后续操作
   */
  async afterInputEditor() {
    // 输入编辑器内容的后续处理
    // 标签、分类输入放在这里
  }

  /**
   * 发布文章
   */
  async publish() {
    logger.info(`publishing article`);

    //发布后地址会变更用waitForNavigation，不会变更用固定时间，尽量减少等待时间
    await Promise.all([
      //@ts-ignore
      this.page.$eval(this.editorSel.publish, submit => submit.click()),
      this.publishNavigationChange
        ? this.page.waitForNavigation()
        : this.page.waitForTimeout(1500)
    ]);

    // 后续处理
    await this.afterPublish();
  }

  /**
   * 发布文章后续操作
   */
  async afterPublish() {
    // 提交文章的后续处理
    // 保存文章url等逻辑放在这里
  }

  /**
   * 运行爬虫
   */
  async run() {
    // 初始化
    await this.init();

    if (this.task.authType === constants.authType.LOGIN) {
      // 登陆
      await this.login();
    } else {
      // 使用Cookie
      await this.setCookies();
    }

    // 导航至编辑器
    await this.goToEditor();

    // 输入编辑器内容
    await this.inputEditor();

    // 发布文章
    await this.publish();

    // 关闭浏览器
    // await this.browser.close();
  }

  /**
   * 获取文章统计数据
   */
  async fetchStats() {
    // to be inherited
  }

  /**
   * 获取文章统计数据后续操作
   */
  async afterFetchStats() {
    // 统计文章总阅读、点赞、评论数
    const tasks = await models.Task.find({ articleId: this.article._id });
    let readNum = 0;
    let likeNum = 0;
    let commentNum = 0;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      readNum += task.readNum || 0;
      likeNum += task.likeNum || 0;
      commentNum += task.commentNum || 0;
    }
    this.article.readNum = readNum;
    this.article.likeNum = likeNum;
    this.article.commentNum = commentNum;
    await this.article.save();
  }

  /**
   * 运行获取文章统计数据
   */
  async runFetchStats() {
    // 初始化
    await this.init();

    // 获取文章数据
    await this.fetchStats();

    // 后续操作
    await this.afterFetchStats();

    // 关闭浏览器
    const pages = await this.browser.pages();
    await Promise.all(pages.map(page => page.close()));
    await this.browser.close();
  }

  /**
   * 检查Cookie是否能正常登陆
   */
  async checkCookieStatus() {
    // platform
    this.platform = await models.Platform.findOne({ _id: ObjectId(this.platformId) });

    //百家号不支持 cookie，页面埋了token，只携带cookie 还是未登陆态，页面请求后会将token失效
    if (this.platform.name === constants.platform.BAIJIAHAO) {
      this.platform.loggedIn = false;
      await this.platform.save();
      return;
    }

    const cookie = await this.getCookiesForAxios();
    if (!cookie) {
      this.platform.loggedIn = false;
      await this.platform.save();
      return;
    }
    let url = this.platform.url
    if (this.platform.name === constants.platform.CSDN) {
      url = "https://me.csdn.net/api/user/getUserPrivacy"
    }
    if (this.platform.name === constants.platform.ALIYUN) {
      url = "https://developer.aliyun.com/developer/api/my/user/getUser"
    }
    axios.get(url, {
        headers: {
          'Cookie': cookie,
        },
      })
      .then(async res => {
        logger.info(url);
        let text = res.data;
        if (this.platform.name === constants.platform.TOUTIAO) {
          this.platform.loggedIn = !text.includes('login-button');
        } else if (this.platform.name === constants.platform.CSDN) {
          text = text.message
          this.platform.loggedIn = text.includes('成功');
        } else if (this.platform.name === constants.platform.JIANSHU) {
          this.platform.loggedIn = text.includes('current_user');
        } else if ([constants.platform.CNBLOGS, constants.platform.B_51CTO].includes(this.platform.name)) {
          this.platform.loggedIn = text.includes('我的博客');
        } else if (this.platform.name === constants.platform.SEGMENTFAULT) {
          this.platform.loggedIn = text.includes('user_id');
        }
        else if (this.platform.name === constants.platform.OSCHINA) {
          this.platform.loggedIn = text.includes('g_user_name');
        }
        else if (this.platform.name === constants.platform.V2EX) {
          this.platform.loggedIn = text.includes('登出');
        }
        else if (this.platform.name === constants.platform.ALIYUN) {
          this.platform.loggedIn = text.data != null
        }
        else {
          this.platform.loggedIn = !text.includes('登录');
        }
        logger.info(this.platform.loggedIn);
        await this.platform.save();
      })
      .catch(error => {
        logger.error(`${url} 登录态校验异常`);
        logger.error(error);
      });

  }
}

export = BaseSpider;

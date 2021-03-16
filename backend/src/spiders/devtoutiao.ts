import BaseSpider = require("./base");
import constants from "../constants"

class DevTouTiaoSpider extends BaseSpider {
  async inputContent(article, editorSel) {
    const footerContent = "";
    const content = article.content + footerContent;
    const el = document.querySelector(editorSel.content);
    el.CodeMirror.setValue(content);
  }

  async afterInputEditor() {

  }

  async inputFooter(article, editorSel) {
    // do nothing
  }

  getCookieDomainCondition() {
      return { $regex: '.*\.?toutiao\.io'}
  }

  async afterPublish() {
    await this.page.waitForSelector('.user-nav-tabs');

    await Promise.all([
      this.page.click('.user-nav-tabs li:nth-child(2) a'),
      this.page.waitForNavigation()
    ]);

    const articleLink = await this.page.$('.posts .post:nth-child(1) .title a');
    const url = await (await articleLink!.getProperty('href')).jsonValue();

    this.task.url = url;
    this.task.updateTs = new Date();
    this.task.status = constants.status.FINISHED;
    this.task.error = null;
    await this.task.save();
  }
}

export = DevTouTiaoSpider;

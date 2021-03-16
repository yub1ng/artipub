import BaseSpider = require("./base");
import constants from "../constants"

class B51CTOSpider extends BaseSpider {
  async inputContent(article, editorSel) {
    const footerContent = "";
    const content = article.content + footerContent;
    const el = document.querySelector(editorSel.content);
    el.CodeMirror.setValue(content);
  }

  async afterInputEditor() {
    await this.page.evaluate(task => {
      document.querySelector<HTMLInputElement>('#blog_type')!.value = '1';
      //TODO 先写死
      document.querySelector<HTMLInputElement>('#pid')!.value = '31';
      document.querySelector<HTMLInputElement>('#cate_id')!.value = '8';
      document.querySelector<HTMLInputElement>('#tag')!.value = task.tag;
    }, this.task);

  }

  async afterPublish() {
    await this.page.waitForTimeout(4000);

    const look = await this.page.$('.look');
    const url = await (await look!.getProperty('href')).jsonValue();

    this.task.url = url;
    this.task.updateTs = new Date();
    this.task.status = constants.status.FINISHED;
    this.task.error = null;
    await this.task.save();
  }
}

export = B51CTOSpider;

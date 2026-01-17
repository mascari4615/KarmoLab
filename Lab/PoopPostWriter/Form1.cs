using OpenQA.Selenium;
using OpenQA.Selenium.Firefox;
using System;

namespace PoopPostWriter
{
	public partial class Form1 : Form
	{
		public Form1()
		{
			InitializeComponent();
		}

		private void textBox1_TextChanged(object sender, EventArgs e)
		{

		}

		private void button1_Click(object sender, EventArgs e)
		{
			// FirefoxDriverService driverService = FirefoxDriverService.CreateDefaultService(@"D:\MyProgram\PoopPostWriter\geckodriver-v0.31.0-win64", "geckodriver.exe");
			FirefoxDriverService driverService = FirefoxDriverService.CreateDefaultService(@"D:\MyProgram\PoopPostWriter");
			driverService.FirefoxBinaryPath = @"C:\Program Files\Mozilla Firefox\firefox.exe";
			driverService.HideCommandPromptWindow = true;

			FirefoxOptions options = new FirefoxOptions();
			using (IWebDriver driver = new FirefoxDriver(driverService, options))
			{

				// Go to the home page
				driver.Navigate().GoToUrl("http://www.naver.com");
				this.textBox1.Text = this.textBox1.Text + string.Format("Url 이동 : {0}", driver.Url) + Environment.NewLine;
				driver.Navigate().GoToUrl("https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fwww.naver.com");
				this.textBox1.Text = this.textBox1.Text + string.Format("Url 이동 : {0}", driver.Url) + Environment.NewLine;

				var idField = driver.FindElement(by: By.Id("id"));
				var pwField = driver.FindElement(by: By.Id("pw"));
				var loginButton = driver.FindElement(by: By.Id("log.login"));

				this.textBox1.Text = this.textBox1.Text + "로그인 시도" + Environment.NewLine;

				idField.Click();
				Clipboard.SetText("아이디");
				idField.SendKeys(OpenQA.Selenium.Keys.Control + "v");

				pwField.Click();
				Clipboard.SetText("비밀번호");
				pwField.SendKeys(OpenQA.Selenium.Keys.Control + "v");

				loginButton.Click();

				this.textBox1.Text = this.textBox1.Text + string.Format("Url 이동 : {0}", driver.Url) + Environment.NewLine;
				if (driver.Url.Equals("https://nid.naver.com/nidlogin.login"))
				{
					var pnField = driver.FindElement(by: By.Id("phone_value"));
					var submitButton = driver.FindElement(by: By.Id("oab.submit"));

					pnField.SendKeys("폰 번호");
					submitButton.Click();
				}
				Thread.Sleep(2000);

				if (driver.Url.Contains("https://nid.naver.com/login/ext/deviceConfirm"))
				{
					var saveButton = driver.FindElement(by: By.Id("new.save"));
					saveButton.Click();
				}
				Thread.Sleep(2000);

				this.textBox1.Text = this.textBox1.Text + string.Format("Url 이동 : {0}", driver.Url) + Environment.NewLine;
				string nowUrl = driver.Url;
				this.textBox1.Text = this.textBox1.Text + "로그인 성공" + Environment.NewLine;
			}

			/*while (true)
			{
				Thread.Sleep(2000);

			}*/
		}
	}
}
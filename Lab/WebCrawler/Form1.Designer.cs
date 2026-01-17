
namespace WebCrawler
{
    partial class Form1
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
			this.letsgoButton = new System.Windows.Forms.Button();
			this.log = new System.Windows.Forms.RichTextBox();
			this.postNumber = new System.Windows.Forms.TextBox();
			this.label1 = new System.Windows.Forms.Label();
			this.label2 = new System.Windows.Forms.Label();
			this.label3 = new System.Windows.Forms.Label();
			this.textBox1 = new System.Windows.Forms.TextBox();
			this.tabControl1 = new System.Windows.Forms.TabControl();
			this.DCInsideImageCrawling = new System.Windows.Forms.TabPage();
			this.BaekjoonBackupMyCode = new System.Windows.Forms.TabPage();
			this.BaekjoonBackupButton = new System.Windows.Forms.Button();
			this.richTextBox1 = new System.Windows.Forms.RichTextBox();
			this.tabControl1.SuspendLayout();
			this.DCInsideImageCrawling.SuspendLayout();
			this.BaekjoonBackupMyCode.SuspendLayout();
			this.SuspendLayout();
			// 
			// letsgoButton
			// 
			this.letsgoButton.Location = new System.Drawing.Point(198, 80);
			this.letsgoButton.Name = "letsgoButton";
			this.letsgoButton.Size = new System.Drawing.Size(100, 36);
			this.letsgoButton.TabIndex = 0;
			this.letsgoButton.Text = "ㄱㄱ";
			this.letsgoButton.UseVisualStyleBackColor = true;
			this.letsgoButton.Click += new System.EventHandler(this.DCImageCrawlingBtn_Click);
			// 
			// log
			// 
			this.log.Location = new System.Drawing.Point(21, 88);
			this.log.Name = "log";
			this.log.Size = new System.Drawing.Size(142, 140);
			this.log.TabIndex = 4;
			this.log.Text = "";
			// 
			// postNumber
			// 
			this.postNumber.Location = new System.Drawing.Point(99, 33);
			this.postNumber.Name = "postNumber";
			this.postNumber.Size = new System.Drawing.Size(61, 23);
			this.postNumber.TabIndex = 5;
			this.postNumber.Text = "36254";
			this.postNumber.TextChanged += new System.EventHandler(this.postNumber_TextChanged);
			// 
			// label1
			// 
			this.label1.AutoSize = true;
			this.label1.Location = new System.Drawing.Point(45, 15);
			this.label1.Name = "label1";
			this.label1.Size = new System.Drawing.Size(91, 15);
			this.label1.TabIndex = 6;
			this.label1.Text = "종료 할 글 번호";
			this.label1.Click += new System.EventHandler(this.label1_Click);
			// 
			// label2
			// 
			this.label2.AutoSize = true;
			this.label2.Location = new System.Drawing.Point(21, 62);
			this.label2.Name = "label2";
			this.label2.Size = new System.Drawing.Size(115, 15);
			this.label2.TabIndex = 7;
			this.label2.Text = "링크가 없는 글 번호";
			this.label2.Click += new System.EventHandler(this.label2_Click);
			// 
			// label3
			// 
			this.label3.AutoSize = true;
			this.label3.Location = new System.Drawing.Point(163, 36);
			this.label3.Name = "label3";
			this.label3.Size = new System.Drawing.Size(135, 15);
			this.label3.TabIndex = 8;
			this.label3.Text = "다운로드 위치 바꿔야함";
			this.label3.Click += new System.EventHandler(this.label3_Click);
			// 
			// textBox1
			// 
			this.textBox1.Location = new System.Drawing.Point(18, 33);
			this.textBox1.Name = "textBox1";
			this.textBox1.Size = new System.Drawing.Size(61, 23);
			this.textBox1.TabIndex = 9;
			this.textBox1.Text = "36440";
			this.textBox1.TextChanged += new System.EventHandler(this.textBox1_TextChanged);
			// 
			// tabControl1
			// 
			this.tabControl1.Controls.Add(this.DCInsideImageCrawling);
			this.tabControl1.Controls.Add(this.BaekjoonBackupMyCode);
			this.tabControl1.Location = new System.Drawing.Point(12, 12);
			this.tabControl1.Name = "tabControl1";
			this.tabControl1.SelectedIndex = 0;
			this.tabControl1.Size = new System.Drawing.Size(426, 339);
			this.tabControl1.TabIndex = 10;
			// 
			// DCInsideImageCrawling
			// 
			this.DCInsideImageCrawling.Controls.Add(this.log);
			this.DCInsideImageCrawling.Controls.Add(this.textBox1);
			this.DCInsideImageCrawling.Controls.Add(this.postNumber);
			this.DCInsideImageCrawling.Controls.Add(this.label3);
			this.DCInsideImageCrawling.Controls.Add(this.letsgoButton);
			this.DCInsideImageCrawling.Controls.Add(this.label2);
			this.DCInsideImageCrawling.Controls.Add(this.label1);
			this.DCInsideImageCrawling.Location = new System.Drawing.Point(4, 24);
			this.DCInsideImageCrawling.Name = "DCInsideImageCrawling";
			this.DCInsideImageCrawling.Padding = new System.Windows.Forms.Padding(3);
			this.DCInsideImageCrawling.Size = new System.Drawing.Size(418, 311);
			this.DCInsideImageCrawling.TabIndex = 0;
			this.DCInsideImageCrawling.Text = "디시 이미지 크롤링";
			this.DCInsideImageCrawling.UseVisualStyleBackColor = true;
			this.DCInsideImageCrawling.Click += new System.EventHandler(this.tabPage1_Click);
			// 
			// BaekjoonBackupMyCode
			// 
			this.BaekjoonBackupMyCode.Controls.Add(this.richTextBox1);
			this.BaekjoonBackupMyCode.Controls.Add(this.BaekjoonBackupButton);
			this.BaekjoonBackupMyCode.Location = new System.Drawing.Point(4, 24);
			this.BaekjoonBackupMyCode.Name = "BaekjoonBackupMyCode";
			this.BaekjoonBackupMyCode.Padding = new System.Windows.Forms.Padding(3);
			this.BaekjoonBackupMyCode.Size = new System.Drawing.Size(418, 311);
			this.BaekjoonBackupMyCode.TabIndex = 1;
			this.BaekjoonBackupMyCode.Text = "백준 코드 백업";
			this.BaekjoonBackupMyCode.UseVisualStyleBackColor = true;
			// 
			// BaekjoonBackupButton
			// 
			this.BaekjoonBackupButton.Location = new System.Drawing.Point(312, 269);
			this.BaekjoonBackupButton.Name = "BaekjoonBackupButton";
			this.BaekjoonBackupButton.Size = new System.Drawing.Size(100, 36);
			this.BaekjoonBackupButton.TabIndex = 1;
			this.BaekjoonBackupButton.Text = "ㄱㄱ";
			this.BaekjoonBackupButton.UseVisualStyleBackColor = true;
			this.BaekjoonBackupButton.Click += new System.EventHandler(this.BaekjoonCodeDownloadBtn_Click);
			// 
			// richTextBox1
			// 
			this.richTextBox1.Location = new System.Drawing.Point(61, 73);
			this.richTextBox1.Name = "richTextBox1";
			this.richTextBox1.Size = new System.Drawing.Size(142, 140);
			this.richTextBox1.TabIndex = 5;
			this.richTextBox1.Text = "";
			this.richTextBox1.TextChanged += new System.EventHandler(this.richTextBox1_TextChanged);
			// 
			// Form1
			// 
			this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
			this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
			this.ClientSize = new System.Drawing.Size(450, 363);
			this.Controls.Add(this.tabControl1);
			this.Name = "Form1";
			this.Text = "Form1";
			this.tabControl1.ResumeLayout(false);
			this.DCInsideImageCrawling.ResumeLayout(false);
			this.DCInsideImageCrawling.PerformLayout();
			this.BaekjoonBackupMyCode.ResumeLayout(false);
			this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Button letsgoButton;
        private System.Windows.Forms.RichTextBox log;
        private System.Windows.Forms.TextBox postNumber;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.TextBox textBox1;
		private System.Windows.Forms.TabControl tabControl1;
		private System.Windows.Forms.TabPage DCInsideImageCrawling;
		private System.Windows.Forms.TabPage BaekjoonBackupMyCode;
		private System.Windows.Forms.Button BaekjoonBackupButton;
		private System.Windows.Forms.RichTextBox richTextBox1;
	}
}


using KarmoBlazorServer.Areas.Identity;
using KarmoBlazorServer.Data;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
	options.UseSqlServer(connectionString));
builder.Services.AddDatabaseDeveloperPageExceptionFilter();
builder.Services.AddDefaultIdentity<IdentityUser>(options => options.SignIn.RequireConfirmedAccount = false)
	.AddEntityFrameworkStores<ApplicationDbContext>();
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddScoped<AuthenticationStateProvider, RevalidatingIdentityAuthenticationStateProvider<IdentityUser>>();
// builder.Services.AddSingleton<WeatherForecastService>();
// Scoped creates an instance for each user
builder.Services.AddScoped<UserRecordService>();
builder.Services.AddScoped<SpecialThingService>();

// Register the pizzas service
// builder.Services.AddSingleton<TodoService>();
// builder.Services.AddSqlServer<TodoContext>("Data Source=KarmoBlazerServer.db");
// Context를 ASP.NET Core의 종속성 삽입 시스템에 등록
// Context가 Sqlite 데이터베이스 공급자를 사용하도록 지정합니다.
// 로컬 파일 .db를 가리키는 Sqlite 연결 문자열을 정의합니다.

// 내가 쓰고자 하는 건 SQL Server
// 로컬 DB 파일을 사용하는 Sqlite의 경우 지금처럼 연결 문자열을 하드 코딩해도 괜찮지만,
// SQL Server 같은 네트워크 DB의 경우 연결 문자열을 항상 안전하게 보관해야 한다

// 로컬 개발의 경우 비밀 관리자를 사용
// 프로덕션 배포의 경우 Azure Key Vault 같은 서비스를 사용하는 것이 좋다

// Read the connection string from the appsettings.json file
// Set the database connection for the EndtoEndContext
builder.Services.AddDbContext<KarmoBlazorServerDB.Data.KarmoBlazorServer.KarmoAppContext>(options =>
options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
	app.UseMigrationsEndPoint();
}
else
{
	app.UseExceptionHandler("/Error");
	// The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
	app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapControllers();
app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

app.Run();

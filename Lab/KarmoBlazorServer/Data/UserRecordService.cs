/*namespace KarmoBlazorServer.Data
{
	public class WeatherForecastService
	{
		private static readonly string[] Summaries = new[]
		{
		"Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
	};

		public Task<WeatherForecast[]> GetForecastAsync(DateOnly startDate)
		{
			return Task.FromResult(Enumerable.Range(1, 5).Select(index => new WeatherForecast
			{
				Date = startDate.AddDays(index),
				TemperatureC = Random.Shared.Next(-20, 55),
				Summary = Summaries[Random.Shared.Next(Summaries.Length)]
			}).ToArray());
		}
	}
}*/

using KarmoBlazorServerDB.Data.KarmoBlazorServer;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace KarmoBlazorServer.Data
{
    public class UserRecordService
    {
        private readonly KarmoAppContext _context;

        public UserRecordService(KarmoAppContext context)
        {
            _context = context;
        }

        public async Task<List<UserRecord>> GetUserRecordAsync()
        {
            // Get Weather Forecasts
            return await _context.UserRecord
            .AsNoTracking().ToListAsync();
        }

        /*public async Task<List<UserRecord>> GetTempAsync(string tempName)
        {
            // Get Weather Forecasts
            return await _context.UserRecord
            // Only get entries for the current logged in user
            .Where(x => x.Name == tempName)
            // Use AsNoTracking to disable EF change tracking
            // Use ToListAsync to avoid blocking a thread
            .AsNoTracking().ToListAsync();
        }*/

        public Task<UserRecord> CreateUserRecordAsync(UserRecord objUserRecord)
        {
            _context.UserRecord.Add(objUserRecord);
            _context.SaveChanges();
            return Task.FromResult(objUserRecord);
        }

        public Task<bool> UpdateUserRecordAsync(UserRecord objUserRecord)
        {
            var ExistingUserRecord = _context.UserRecord.Where(x => x.Id == objUserRecord.Id).FirstOrDefault();
            if (ExistingUserRecord != null)
            {
                ExistingUserRecord.UserName = objUserRecord.UserName;
                ExistingUserRecord.Date = objUserRecord.Date;
                ExistingUserRecord.SpecialThingId = objUserRecord.SpecialThingId;
                ExistingUserRecord.Comment = objUserRecord.Comment;
                ExistingUserRecord.Star = objUserRecord.Star;
                _context.SaveChanges();
            }
            else
            {
                return Task.FromResult(false);
            }
            return Task.FromResult(true);
        }

        public Task<bool> DeleteUserRecordAsync(UserRecord objUserRecord)
        {
            var ExistingUserRecord = _context.UserRecord.Where(x => x.Id == objUserRecord.Id).FirstOrDefault();
            if (ExistingUserRecord != null)
            {
                _context.UserRecord.Remove(ExistingUserRecord);
                _context.SaveChanges();
            }
            else
            {
                return Task.FromResult(false);
            }
            return Task.FromResult(true);
        }
    }
}
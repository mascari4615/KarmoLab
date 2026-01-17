using KarmoBlazorServerDB.Data.KarmoBlazorServer;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace KarmoBlazorServer.Data
{
    public class SpecialThingService
    {
        private readonly KarmoAppContext _context;

        public SpecialThingService(KarmoAppContext context)
        {
            _context = context;
        }

        public async Task<List<SpecialThing>> GetSpecialThingAsync()
        {
            // Get Weather Forecasts
            return await _context.SpecialThing
            .AsNoTracking().ToListAsync();
        }

        /*public async Task<List<SpecialThing>> GetTempAsync(string tempName)
        {
            // Get Weather Forecasts
            return await _context.SpecialThing
            // Only get entries for the current logged in user
            .Where(x => x.Name == tempName)
            // Use AsNoTracking to disable EF change tracking
            // Use ToListAsync to avoid blocking a thread
            .AsNoTracking().ToListAsync();
        }*/

        public Task<SpecialThing> CreateSpecialThingAsync(SpecialThing objSpecialThing)
        {
            _context.SpecialThing.Add(objSpecialThing);
            _context.SaveChanges();
            return Task.FromResult(objSpecialThing);
        }

        public Task<bool> UpdateSpecialThingAsync(SpecialThing objSpecialThing)
        {
            var ExistingTemp = _context.SpecialThing.Where(x => x.Id == objSpecialThing.Id).FirstOrDefault();
            if (ExistingTemp != null)
            {
                ExistingTemp.Name = objSpecialThing.Name;
                ExistingTemp.Date = objSpecialThing.Date;
                ExistingTemp.Creator = objSpecialThing.Creator;
                ExistingTemp.Type = objSpecialThing.Type;
                _context.SaveChanges();
            }
            else
            {
                return Task.FromResult(false);
            }
            return Task.FromResult(true);
        }

        public Task<bool> DeleteSpecialThingAsync(SpecialThing objSpecialThing)
        {
            var ExistingSpecialThing = _context.SpecialThing.Where(x => x.Id == objSpecialThing.Id).FirstOrDefault();
            if (ExistingSpecialThing != null)
            {
                _context.SpecialThing.Remove(ExistingSpecialThing);
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
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace KarmoHub.Converters;

public class BooleanToVisibilityConverter : IValueConverter
{
	public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
	{
		bool flag = false;
		if (value is bool b)
		{
			flag = b;
		}
		else if (value != null)
		{
			flag = true;
		}

		if (parameter is string p && p == "Inverse")
		{
			flag = !flag;
		}

		return flag ? Visibility.Visible : Visibility.Collapsed;
	}

	public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
	{
		throw new NotImplementedException();
	}
}

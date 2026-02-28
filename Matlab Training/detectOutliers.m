function outliers = detectOutliers(x,method)
% Detect outliers using MAD / Z-score / IQR based on method string

x = x(:); % ensure column
xNoNaN = x(~isnan(x));

if isempty(xNoNaN)
    outliers = false(size(x));
    return
end

method = string(method);

if contains(method,"MAD")

    % ----- MAD METHOD -----
    med = median(xNoNaN);
    MADv = mad(xNoNaN,1);
    outliers = abs(x-med) > 3*MADv;

elseif contains(method,"Z-score")

    % ----- Z SCORE -----
    mu = mean(xNoNaN);
    sigma = std(xNoNaN);
    outliers = abs((x-mu)/sigma) > 3;

else

    % ----- IQR (default) -----
    Q1 = quantile(xNoNaN,0.25);
    Q3 = quantile(xNoNaN,0.75);
    IQRv = Q3-Q1;

    lower = Q1 - 1.5*IQRv;
    upper = Q3 + 1.5*IQRv;

    outliers = x<lower | x>upper;
end
end
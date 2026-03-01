load('CKD_Exported_Models.mat'); t = models.tree; disp(properties(t)); disp(t.CutPredictor(1:2)); disp(t.Children(1:2, :));
